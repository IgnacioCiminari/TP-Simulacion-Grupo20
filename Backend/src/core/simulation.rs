//! Motor de simulación por eventos discretos (DES) con soporte multi-día.
//!
//! Diferencias de diseño respecto de la versión en Python (mismos resultados):
//!
//! 1. **Días en paralelo.** Cada día usa una semilla derivada de forma
//!    determinística de la semilla maestra, por lo que los días son
//!    independientes entre sí. Se simulan por lotes en todos los núcleos
//!    (rayon) y luego se acumulan en orden, evaluando las condiciones de corte
//!    día por día: se obtiene exactamente el mismo resultado que en secuencial.
//!
//! 2. **Vector de estado bajo demanda.** Durante la corrida solo se guardan las
//!    estadísticas de cada día (no millones de filas en RAM). Cuando se pide el
//!    vector de estado de un día, ese día se vuelve a simular con su semilla
//!    (microsegundos) y se obtienen exactamente las mismas filas. Los
//!    acumulados globales (`Acum_Global_*`) se reconstruyen con sumas parciales
//!    en el mismo orden que Python.

use std::borrow::Cow;
use std::io::{self, Write};
use std::time::Instant;

use rayon::prelude::*;

use crate::core::event::{Event, EventKind};
use crate::core::fel::EventQueue;
use crate::core::rng::TrackedRandom;
use crate::core::state::SimulationState;
use crate::entities::line::InspectionLine;
use crate::stats::exporter::{DayOffsets, MemoryExporter, Row};
use crate::stats::tracker::{GlobalStatsAccumulator, StatsTracker};

/// Parámetros configurables de la simulación.
#[derive(Debug, Clone)]
pub struct SimulationConfig {
    // Horario de la jornada (en minutos desde la medianoche)
    pub hora_apertura: f64,
    pub hora_cierre_puertas: f64,

    // Tiempos medios de llegada (exponencial, en minutos)
    pub media_llegada_auto: f64,
    pub media_llegada_camioneta: f64,

    // Tiempos de revisión (uniforme, en minutos)
    pub frenos_min: f64,
    pub frenos_max: f64,
    pub luces_min: f64,
    pub luces_max: f64,

    // Infraestructura
    pub num_lineas: usize,

    // Semilla de reproducibilidad (fija internamente, no expuesta al usuario)
    pub master_seed: u64,

    // Condiciones de corte (se detiene al cumplirse CUALQUIERA)
    pub max_dias: u64,
    pub max_iteraciones: u64,
}

impl Default for SimulationConfig {
    fn default() -> Self {
        Self {
            hora_apertura: 480.0,
            hora_cierre_puertas: 960.0,
            media_llegada_auto: 15.0,
            media_llegada_camioneta: 30.0,
            frenos_min: 4.0,
            frenos_max: 7.0,
            luces_min: 6.0,
            luces_max: 10.0,
            num_lineas: 2,
            master_seed: 42,
            max_dias: 10,
            max_iteraciones: 1_000,
        }
    }
}

/// Deriva una semilla determinística para un día a partir de la semilla maestra.
#[inline]
pub fn derive_seed(master_seed: u64, dia: u64) -> u64 {
    master_seed
        .wrapping_mul(6_364_136_223_846_793_005)
        .wrapping_add(dia)
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexto de fila: RNDs y tiempos generados durante el evento actual.
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Default)]
pub struct LineContext {
    pub rnd_frenos: Option<f64>,
    pub tiempo_frenos: Option<f64>,
    pub rnd_luces: Option<f64>,
    pub tiempo_luces: Option<f64>,
    pub tiempo_bloqueo: Option<f64>,
}

#[derive(Debug, Clone, Default)]
pub struct RowContext {
    pub rnd_llegada_auto: Option<f64>,
    pub tiempo_llegada_auto: Option<f64>,
    pub rnd_llegada_camioneta: Option<f64>,
    pub tiempo_llegada_camioneta: Option<f64>,
    pub tiempo_espera_auto: Option<f64>,
    pub tiempo_espera_camioneta: Option<f64>,
    pub lines: Vec<LineContext>,
}

impl RowContext {
    fn new(num_lineas: usize) -> Self {
        Self {
            lines: vec![LineContext::default(); num_lineas],
            ..Default::default()
        }
    }

    #[inline]
    pub fn reset(&mut self) {
        self.rnd_llegada_auto = None;
        self.tiempo_llegada_auto = None;
        self.rnd_llegada_camioneta = None;
        self.tiempo_llegada_camioneta = None;
        self.tiempo_espera_auto = None;
        self.tiempo_espera_camioneta = None;
        for l in &mut self.lines {
            *l = LineContext::default();
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulación de UN día (lo que en Python era el estado de `Simulation` durante
// `_run_single_day`). Es lo que reciben los eventos al procesarse.
// ─────────────────────────────────────────────────────────────────────────────

pub struct DaySim<'a> {
    pub config: &'a SimulationConfig,
    pub dia: u64,
    pub rng: TrackedRandom,
    pub state: SimulationState,
    pub fel: EventQueue,
    pub tracker: StatsTracker,
    pub row_context: RowContext,
}

impl<'a> DaySim<'a> {
    /// Inicializa un estado fresco para el día indicado.
    pub fn new(config: &'a SimulationConfig, dia: u64) -> Self {
        let n = config.num_lineas;
        let lines = (0..n).map(|i| InspectionLine::new(i as u32 + 1)).collect();
        let mut state = SimulationState::new(lines);
        state.clock = config.hora_apertura;
        Self {
            config,
            dia,
            rng: TrackedRandom::new(derive_seed(config.master_seed, dia)),
            state,
            fel: EventQueue::new(),
            tracker: StatsTracker::new(config),
            row_context: RowContext::new(n),
        }
    }

    #[inline]
    pub fn reset_row_context(&mut self) {
        self.row_context.reset();
    }

    // ── Generadores de variables aleatorias (registran el RND en el contexto) ──

    pub fn sample_llegada_auto(&mut self) -> f64 {
        let (rnd, value) = self.rng.exponential(self.config.media_llegada_auto);
        self.row_context.rnd_llegada_auto = Some(rnd);
        self.row_context.tiempo_llegada_auto = Some(value);
        value
    }

    pub fn sample_llegada_camioneta(&mut self) -> f64 {
        let (rnd, value) = self.rng.exponential(self.config.media_llegada_camioneta);
        self.row_context.rnd_llegada_camioneta = Some(rnd);
        self.row_context.tiempo_llegada_camioneta = Some(value);
        value
    }

    pub fn sample_tiempo_frenos(&mut self, line_id: u32) -> f64 {
        let (rnd, value) = self.rng.uniform(self.config.frenos_min, self.config.frenos_max);
        let ctx = &mut self.row_context.lines[(line_id - 1) as usize];
        ctx.rnd_frenos = Some(rnd);
        ctx.tiempo_frenos = Some(value);
        value
    }

    pub fn sample_tiempo_luces(&mut self, line_id: u32) -> f64 {
        let (rnd, value) = self.rng.uniform(self.config.luces_min, self.config.luces_max);
        let ctx = &mut self.row_context.lines[(line_id - 1) as usize];
        ctx.rnd_luces = Some(rnd);
        ctx.tiempo_luces = Some(value);
        value
    }

    /// Agenda un evento en la FEL.
    #[inline]
    pub fn schedule(&mut self, event: Event) {
        self.fel.push(event);
    }

    /// Ejecuta el día completo. Si se pasa un `exporter`, se registra cada fila
    /// del vector de estado; si no, solo se calculan las estadísticas (modo rápido).
    ///
    /// Devuelve `(tracker, iteraciones)` donde `iteraciones` es la cantidad de
    /// filas del vector de estado del día.
    pub fn run(mut self, mut exporter: Option<&mut MemoryExporter>) -> (StatsTracker, u64) {
        // ── Agendar eventos iniciales ──────────────────────────────────────
        self.reset_row_context();
        let t0 = self.config.hora_apertura;

        let t_auto = self.sample_llegada_auto();
        let prox_auto = t0 + t_auto;
        self.state.prox_llegada_auto = Some(prox_auto);
        self.schedule(Event::new(prox_auto, EventKind::LlegadaAuto));

        let t_cam = self.sample_llegada_camioneta();
        let prox_cam = t0 + t_cam;
        self.state.prox_llegada_camioneta = Some(prox_cam);
        self.schedule(Event::new(prox_cam, EventKind::LlegadaCamioneta));

        self.schedule(Event::new(
            self.config.hora_cierre_puertas,
            EventKind::CierrePuertas,
        ));

        let mut iteraciones: u64 = 1;
        if let Some(exp) = exporter.as_deref_mut() {
            exp.write_row(Cow::Borrowed("Inicialización"), &self);
        }
        self.tracker.update_max_cola(&self.state);

        // ── Bucle del día ──────────────────────────────────────────────────
        while let Some(event) = self.fel.pop() {
            self.state.clock = event.timestamp;
            self.reset_row_context();
            event.process(&mut self);
            iteraciones += 1;
            if let Some(exp) = exporter.as_deref_mut() {
                exp.write_row(event.nombre(), &self);
            }
            self.tracker.update_max_cola(&self.state);
        }

        // ── Registrar fin de jornada ───────────────────────────────────────
        self.state.fin_jornada = Some(self.state.clock);
        self.tracker.fin_jornada = Some(self.state.clock);
        self.tracker.cache_final_stats(&self.state);

        (self.tracker, iteraciones)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulación multi-día
// ─────────────────────────────────────────────────────────────────────────────

/// Resultado de un día de simulación (sin las filas: se regeneran bajo demanda).
#[derive(Debug, Clone)]
pub struct DayResult {
    pub dia: u64,
    pub tracker: StatsTracker,
    /// Cantidad de filas del vector de estado de ese día.
    pub iteraciones: u64,
}

pub struct Simulation {
    pub config: SimulationConfig,
    pub exporter: MemoryExporter,
    pub results: Vec<DayResult>,
    pub global_stats: GlobalStatsAccumulator,
    pub total_iteraciones: u64,
    /// Tiempo real de ejecución de `run()` en segundos.
    pub elapsed_seconds: f64,
}

/// Tamaño máximo del lote de días que se simulan en paralelo.
const MAX_BATCH: u64 = 4096;

impl Simulation {
    pub fn new(config: SimulationConfig) -> Self {
        let exporter = MemoryExporter::new(config.num_lineas);
        Self {
            config,
            exporter,
            results: Vec::new(),
            global_stats: GlobalStatsAccumulator::default(),
            total_iteraciones: 0,
            elapsed_seconds: 0.0,
        }
    }

    /// Ejecuta la simulación completa respetando las condiciones de corte.
    ///
    /// `on_day_complete(dia, total_iteraciones)` se invoca a medida que se
    /// completan lotes de días. Si devuelve `false`, la simulación se cancela
    /// (por ejemplo, porque fue reemplazada por otra) y `run` devuelve `false`.
    pub fn run<F: FnMut(u64, u64) -> bool>(&mut self, mut on_day_complete: F) -> bool {
        self.results.clear();
        self.global_stats = GlobalStatsAccumulator::default();
        self.total_iteraciones = 0;

        let t_start = Instant::now();
        // Python siempre simula al menos el día 1 antes de evaluar el corte.
        let max_dias = self.config.max_dias.max(1);
        let max_iter = self.config.max_iteraciones;

        let config = &self.config;
        let mut dia: u64 = 1;
        let mut batch: u64 = 64;
        let mut terminado = false;

        while !terminado {
            let fin_lote = (dia + batch - 1).min(max_dias);
            let lote: Vec<(StatsTracker, u64)> = (dia..=fin_lote)
                .into_par_iter()
                .map(|d| DaySim::new(config, d).run(None))
                .collect();

            for (tracker, iteraciones) in lote {
                self.total_iteraciones += iteraciones;
                self.global_stats.add_day(&tracker);
                self.results.push(DayResult {
                    dia,
                    tracker,
                    iteraciones,
                });

                // Evaluar condiciones de corte (se corta si se cumple CUALQUIERA)
                if dia >= max_dias || self.total_iteraciones >= max_iter {
                    terminado = true;
                    break;
                }
                dia += 1;
            }

            let ultimo = self.results.len() as u64;
            if !on_day_complete(ultimo, self.total_iteraciones) {
                self.elapsed_seconds = t_start.elapsed().as_secs_f64();
                return false;
            }
            batch = (batch * 2).min(MAX_BATCH);
        }

        self.elapsed_seconds = t_start.elapsed().as_secs_f64();
        true
    }

    pub fn total_dias(&self) -> u64 {
        self.results.len() as u64
    }

    pub fn day(&self, dia: u64) -> Option<&DayResult> {
        if dia == 0 {
            return None;
        }
        self.results.get((dia - 1) as usize)
    }

    /// Número de iteración previo al día y acumulados globales al cierre del
    /// día anterior (sumados en el mismo orden que Python).
    fn day_start(&self, dia: u64) -> (u64, DayOffsets) {
        let mut iter = 0;
        let mut offsets = DayOffsets::new(self.config.num_lineas);
        for r in &self.results[..(dia - 1) as usize] {
            iter += r.iteraciones;
            offsets.advance(&r.tracker);
        }
        (iter, offsets)
    }

    fn replay(&self, dia: u64, primera_iteracion: u64, offsets: DayOffsets) -> Vec<Row> {
        let mut exporter = self.exporter.clone_layout();
        exporter.start_day(dia, primera_iteracion, offsets);
        DaySim::new(&self.config, dia).run(Some(&mut exporter));
        exporter.current_day_rows
    }

    /// Regenera el vector de estado completo de un día.
    pub fn replay_day(&self, dia: u64) -> Option<Vec<Row>> {
        self.day(dia)?;
        let (iter, offsets) = self.day_start(dia);
        Some(self.replay(dia, iter, offsets))
    }

    /// Último registro generado en toda la simulación.
    pub fn last_row(&self) -> Option<Row> {
        let last = self.results.last()?;
        self.replay_day(last.dia)?.pop()
    }

    /// Escribe el CSV completo (con BOM para Excel). Los días se regeneran y
    /// formatean en paralelo por bloques y se escriben en orden.
    pub fn write_csv<W: Write>(&self, out: &mut W) -> io::Result<()> {
        out.write_all(b"\xEF\xBB\xBF")?;
        let mut header = String::new();
        self.exporter.write_csv_header(&mut header);
        out.write_all(header.as_bytes())?;

        let mut iter = 0;
        let mut offsets = DayOffsets::new(self.config.num_lineas);

        for bloque in self.results.chunks(512) {
            let mut inicios = Vec::with_capacity(bloque.len());
            for r in bloque {
                inicios.push((r.dia, iter, offsets.clone()));
                iter += r.iteraciones;
                offsets.advance(&r.tracker);
            }
            let textos: Vec<String> = inicios
                .into_par_iter()
                .map(|(dia, it, off)| {
                    let rows = self.replay(dia, it, off);
                    let mut s = String::with_capacity(rows.len() * 512);
                    for row in &rows {
                        self.exporter.write_csv_row(row, &mut s);
                    }
                    s
                })
                .collect();
            for t in textos {
                out.write_all(t.as_bytes())?;
            }
        }
        out.flush()
    }
}
