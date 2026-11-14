//! Tests de integración y comportamiento: bloqueo/desbloqueo de estaciones,
//! simulación completa, determinismo y equivalencia paralelo vs. secuencial.

use rtv_backend::core::simulation::{DaySim, Simulation, SimulationConfig};
use rtv_backend::entities::station::{Station, StationType};
use rtv_backend::stats::exporter::Cell;

fn run_sim(config: SimulationConfig) -> Simulation {
    let mut sim = Simulation::new(config);
    assert!(sim.run(|_, _| true));
    sim
}

fn config_seed(seed: u64) -> SimulationConfig {
    SimulationConfig {
        master_seed: seed,
        ..SimulationConfig::default()
    }
}

// ── Estaciones ────────────────────────────────────────────────────────────

#[test]
fn station_blocks_when_luces_busy() {
    let mut frenos = Station::new(StationType::Frenos, 1);
    let mut luces = Station::new(StationType::Luces, 1);

    frenos.start_service(1, 0.0, 5.0);
    luces.start_service(2, 0.0, 10.0);

    let done = frenos.finish_service(5.0);
    assert_eq!(done, 1);

    frenos.current_vehicle = Some(1);
    frenos.set_blocked(5.0);

    assert!(frenos.is_blocked(), "Frenos debería estar BLOQUEADO.");
    assert_eq!(frenos.current_vehicle, Some(1));
}

#[test]
fn unblock_on_luces_free() {
    let mut frenos = Station::new(StationType::Frenos, 1);
    let mut luces = Station::new(StationType::Luces, 1);

    luces.start_service(2, 0.0, 10.0);
    frenos.start_service(1, 0.0, 5.0);
    frenos.finish_service(5.0);
    frenos.current_vehicle = Some(1);
    frenos.set_blocked(5.0);

    luces.finish_service(10.0);
    luces.set_free();
    assert!(frenos.is_blocked());

    let blocked = frenos.unblock(10.0);
    assert_eq!(blocked, 1);
    assert!(frenos.is_free());
    assert!(luces.is_free());
    assert!((frenos.total_blocked_time() - 5.0).abs() < 1e-12);
}

#[test]
fn vehicle_goes_to_luces_directly_if_free() {
    let mut frenos = Station::new(StationType::Frenos, 1);
    let mut luces = Station::new(StationType::Luces, 1);

    frenos.start_service(1, 0.0, 5.0);
    let done = frenos.finish_service(5.0);
    assert!(luces.is_free());
    luces.start_service(done, 5.0, 13.0);

    assert!(luces.is_busy());
    assert_eq!(luces.current_vehicle, Some(1));
    assert!(!frenos.is_blocked());
}

// ── Simulación completa ───────────────────────────────────────────────────

#[test]
fn simulation_runs_without_error() {
    let config = config_seed(123);
    let cierre = config.hora_cierre_puertas;
    let sim = run_sim(config);
    assert!(!sim.results.is_empty());
    let fin = sim.results[0].tracker.fin_jornada.unwrap();
    assert!(fin >= cierre);
}

#[test]
fn vehicles_counted_are_positive() {
    let sim = run_sim(config_seed(7));
    assert!(sim.global_stats.total_autos_atendidos > 0);
    assert!(sim.global_stats.total_camionetas_atendidas > 0);
}

#[test]
fn average_waits_are_non_negative() {
    let sim = run_sim(config_seed(99));
    assert!(sim.global_stats.promedio_espera_autos() >= 0.0);
    assert!(sim.global_stats.promedio_espera_camionetas() >= 0.0);
}

#[test]
fn block_percentages_between_0_and_100() {
    let sim = run_sim(config_seed(55));
    for day in &sim.results {
        for lid in 1..=2 {
            let pct = day.tracker.porcentaje_bloqueo_frenos(lid);
            assert!((0.0..=100.0).contains(&pct), "Bloqueo L{lid} fuera de rango: {pct}");
        }
    }
}

#[test]
fn determinism_with_same_seed() {
    let a = run_sim(config_seed(42));
    let b = run_sim(config_seed(42));
    assert_eq!(a.results[0].tracker.fin_jornada, b.results[0].tracker.fin_jornada);
    assert_eq!(a.global_stats.total_autos_atendidos, b.global_stats.total_autos_atendidos);
    assert_eq!(a.global_stats.promedio_espera_autos(), b.global_stats.promedio_espera_autos());
}

#[test]
fn different_seeds_different_results() {
    let a = run_sim(config_seed(1));
    let b = run_sim(config_seed(9999));
    assert_ne!(a.results[0].tracker.fin_jornada, b.results[0].tracker.fin_jornada);
}

#[test]
fn every_day_ends_with_empty_system() {
    let config = config_seed(3);
    for dia in 1..=50 {
        let (tracker, _) = DaySim::new(&config, dia).run(None);
        assert!(tracker.fin_jornada.is_some());
    }
}

#[test]
fn cut_conditions_match_sequential_semantics() {
    // Corte por iteraciones: se completa el día en que se supera el umbral.
    let sim = run_sim(SimulationConfig {
        max_dias: 1000,
        max_iteraciones: 5_000,
        ..SimulationConfig::default()
    });
    let total: u64 = sim.results.iter().map(|r| r.iteraciones).sum();
    let sin_ultimo = total - sim.results.last().unwrap().iteraciones;
    assert!(total >= 5_000);
    assert!(sin_ultimo < 5_000);

    // Corte por días.
    let sim = run_sim(SimulationConfig {
        max_dias: 7,
        max_iteraciones: u64::MAX,
        ..SimulationConfig::default()
    });
    assert_eq!(sim.total_dias(), 7);
}

#[test]
fn parallel_run_equals_sequential() {
    let config = SimulationConfig {
        max_dias: 300,
        max_iteraciones: u64::MAX,
        ..SimulationConfig::default()
    };
    let sim = run_sim(config.clone());
    for (i, r) in sim.results.iter().enumerate() {
        let (t, it) = DaySim::new(&config, i as u64 + 1).run(None);
        assert_eq!(r.dia, i as u64 + 1);
        assert_eq!(r.iteraciones, it);
        assert_eq!(r.tracker.fin_jornada, t.fin_jornada);
        assert_eq!(r.tracker.total_espera_autos, t.total_espera_autos);
    }
}

#[test]
fn iteration_ids_are_sequential_and_replay_matches_stats() {
    let sim = run_sim(SimulationConfig {
        max_dias: 5,
        max_iteraciones: 100_000,
        ..SimulationConfig::default()
    });
    let mut esperado = 1i64;
    for day in &sim.results {
        let rows = sim.replay_day(day.dia).unwrap();
        assert_eq!(rows.len() as u64, day.iteraciones);
        for row in &rows {
            assert_eq!(row[0], Cell::Int(esperado));
            esperado += 1;
        }
    }
}

#[test]
fn last_row_is_accessible() {
    let sim = run_sim(config_seed(42));
    let last = sim.last_row().expect("Debe existir un último registro");
    assert_eq!(last[0], Cell::Int(sim.total_iteraciones as i64));
}

#[test]
fn csv_has_header_and_one_line_per_iteration() {
    let sim = run_sim(SimulationConfig {
        max_dias: 3,
        max_iteraciones: 100_000,
        ..SimulationConfig::default()
    });
    let mut buf = Vec::new();
    sim.write_csv(&mut buf).unwrap();
    let text = String::from_utf8(buf).unwrap();
    assert!(text.starts_with("\u{feff}Iteracion,Dia,Evento,Reloj_min"));
    // Cada registro termina en \r\n; Clientes_Activos va entre comillas.
    let lineas = text.matches("\r\n").count() as u64;
    assert_eq!(lineas, sim.total_iteraciones + 1);
}
