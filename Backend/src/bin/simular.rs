//! Punto de entrada por consola (equivalente a `uv run main.py`).
//!
//! Uso:
//!     cargo run --release --bin simular -- [max_dias] [max_iteraciones]

use rtv_backend::core::simulation::{Simulation, SimulationConfig};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let max_dias = args.get(1).and_then(|a| a.parse().ok()).unwrap_or(10);
    let max_iteraciones = args.get(2).and_then(|a| a.parse().ok()).unwrap_or(1_000);
    let silencioso = args.iter().any(|a| a == "--quiet");

    let config = SimulationConfig {
        // ── Horario de la jornada ──────────────────────────────────────────
        hora_apertura: 480.0,       // 08:00 hs en minutos
        hora_cierre_puertas: 960.0, // 16:00 hs en minutos

        // ── Tasas de llegada (exponencial, parámetro = media) ─────────────
        media_llegada_auto: 15.0,
        media_llegada_camioneta: 30.0,

        // ── Tiempos de servicio (uniforme) ────────────────────────────────
        frenos_min: 4.0,
        frenos_max: 7.0,
        luces_min: 6.0,
        luces_max: 10.0,

        // ── Infraestructura ───────────────────────────────────────────────
        num_lineas: 2,

        // ── Reproducibilidad ──────────────────────────────────────────────
        master_seed: 42,

        // ── Condiciones de corte (se detiene al cumplirse CUALQUIERA) ─────
        max_dias,
        max_iteraciones,
    };

    println!(
        "Iniciando simulación (seed maestra={}, max_dias={}, max_iteraciones={})...",
        config.master_seed, config.max_dias, config.max_iteraciones
    );

    let mut sim = Simulation::new(config);
    sim.run(|_, _| true);

    if !silencioso {
        for day in &sim.results {
            println!("\n{}", "=".repeat(60));
            println!("  DÍA {}", day.dia);
            println!("{}", day.tracker.report_cached());
        }
    }

    let gs = &sim.global_stats;
    println!("\nTotal de días simulados: {}", sim.total_dias());
    println!("Total de iteraciones:    {}", sim.total_iteraciones);
    println!("Tiempo de ejecución: {:.4} s", sim.elapsed_seconds);
    println!("\nESTADÍSTICAS GLOBALES:");
    println!("  Total autos atendidos:       {}", gs.total_autos_atendidos);
    println!("  Total camionetas atendidas:  {}", gs.total_camionetas_atendidas);
    println!("  Promedio espera autos:       {:.4} min", gs.promedio_espera_autos());
    println!("  Promedio espera camionetas:  {:.4} min", gs.promedio_espera_camionetas());
    println!("  Promedio fin de jornada:     {}", gs.promedio_fin_jornada_hhmm());
}
