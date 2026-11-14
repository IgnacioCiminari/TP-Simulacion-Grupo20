//! Métricas por día (`StatsTracker`) y globales (`GlobalStatsAccumulator`).
//!
//! Para replicar exactamente el JSON de Python, los acumuladores por línea son
//! `Option<f64>`: en Python eran diccionarios donde una línea solo aparecía si
//! había registrado al menos un valor (p. ej. un día sin bloqueos en la línea 2
//! no tiene la clave `2` en `acum_bloqueo_frenos`).

use crate::core::simulation::SimulationConfig;
use crate::core::state::SimulationState;

/// Redondeo equivalente a `round(x, n)` de Python (redondeo correcto sobre la
/// representación decimal).
pub fn py_round(x: f64, ndigits: usize) -> f64 {
    if !x.is_finite() {
        return x;
    }
    format!("{x:.ndigits$}").parse().unwrap_or(x)
}

/// Convierte minutos desde la medianoche a `HH:MM`.
pub fn minutos_a_hhmm(minutos: f64) -> String {
    let total = minutos as i64;
    format!("{:02}:{:02}", total / 60, total % 60)
}

#[inline]
fn acumular(slot: &mut Option<f64>, valor: f64) {
    *slot = Some(slot.unwrap_or(0.0) + valor);
}

/// Acumuladores de una línea en un día.
#[derive(Debug, Clone, Copy, Default)]
pub struct LineStats {
    pub bloqueo_frenos: Option<f64>,
    pub servicio_frenos: Option<f64>,
    pub servicio_luces: Option<f64>,
}

/// Métricas de salida de un único día de simulación.
#[derive(Debug, Clone)]
pub struct StatsTracker {
    pub hora_apertura: f64,

    /// Acumuladores por línea (índice = `line_id - 1`).
    pub lines: Vec<LineStats>,

    /// Hora de finalización de la jornada.
    pub fin_jornada: Option<f64>,

    // Valores cacheados al cierre del día (cache_final_stats)
    pub autos_atendidos: u64,
    pub camionetas_atendidas: u64,
    pub max_cola: usize,
    pub total_espera_autos: f64,
    pub total_espera_camionetas: f64,
}

impl StatsTracker {
    pub fn new(config: &SimulationConfig) -> Self {
        Self {
            hora_apertura: config.hora_apertura,
            lines: vec![LineStats::default(); config.num_lineas],
            fin_jornada: None,
            autos_atendidos: 0,
            camionetas_atendidas: 0,
            max_cola: 0,
            total_espera_autos: 0.0,
            total_espera_camionetas: 0.0,
        }
    }

    #[inline]
    fn line_mut(&mut self, line_id: u32) -> &mut LineStats {
        &mut self.lines[(line_id - 1) as usize]
    }

    fn line(&self, line_id: u32) -> Option<&LineStats> {
        self.lines.get((line_id as usize).wrapping_sub(1))
    }

    // ── Registro ───────────────────────────────────────────────────────────

    #[inline]
    pub fn register_servicio_frenos(&mut self, line_id: u32, tiempo: f64) {
        acumular(&mut self.line_mut(line_id).servicio_frenos, tiempo);
    }

    #[inline]
    pub fn register_servicio_luces(&mut self, line_id: u32, tiempo: f64) {
        acumular(&mut self.line_mut(line_id).servicio_luces, tiempo);
    }

    #[inline]
    pub fn register_bloqueo_frenos(&mut self, line_id: u32, tiempo: f64) {
        acumular(&mut self.line_mut(line_id).bloqueo_frenos, tiempo);
    }

    // ── Consultas ──────────────────────────────────────────────────────────

    /// Tiempo bloqueado de Frenos en la línea (0 si nunca se bloqueó).
    pub fn acum_bloqueo_frenos(&self, line_id: u32) -> f64 {
        self.line(line_id).and_then(|l| l.bloqueo_frenos).unwrap_or(0.0)
    }

    pub fn acum_servicio_frenos(&self, line_id: u32) -> f64 {
        self.line(line_id).and_then(|l| l.servicio_frenos).unwrap_or(0.0)
    }

    pub fn acum_servicio_luces(&self, line_id: u32) -> f64 {
        self.line(line_id).and_then(|l| l.servicio_luces).unwrap_or(0.0)
    }

    /// IDs de líneas con algún registro de bloqueo o servicio (ordenados).
    pub fn line_ids(&self) -> Vec<u32> {
        self.lines
            .iter()
            .enumerate()
            .filter(|(_, l)| {
                l.bloqueo_frenos.is_some() || l.servicio_frenos.is_some() || l.servicio_luces.is_some()
            })
            .map(|(i, _)| i as u32 + 1)
            .collect()
    }

    /// % de la jornada en que Frenos de la línea estuvo bloqueado.
    pub fn porcentaje_bloqueo_frenos(&self, line_id: u32) -> f64 {
        let duracion = self.duracion_jornada();
        if duracion <= 0.0 {
            return 0.0;
        }
        self.acum_bloqueo_frenos(line_id) / duracion * 100.0
    }

    /// Tiempo total de atención (frenos + luces) de una línea en el día.
    pub fn total_servicio_linea(&self, line_id: u32) -> f64 {
        self.acum_servicio_frenos(line_id) + self.acum_servicio_luces(line_id)
    }

    pub fn promedio_espera_autos(&self) -> f64 {
        if self.autos_atendidos == 0 {
            0.0
        } else {
            self.total_espera_autos / self.autos_atendidos as f64
        }
    }

    pub fn promedio_espera_camionetas(&self) -> f64 {
        if self.camionetas_atendidas == 0 {
            0.0
        } else {
            self.total_espera_camionetas / self.camionetas_atendidas as f64
        }
    }

    pub fn duracion_jornada(&self) -> f64 {
        match self.fin_jornada {
            None => 0.0,
            Some(fin) => fin - self.hora_apertura,
        }
    }

    pub fn hora_fin_jornada_hhmm(&self) -> String {
        match self.fin_jornada {
            None => "N/A".to_string(),
            Some(fin) => minutos_a_hhmm(fin),
        }
    }

    /// Persiste los valores que dependen del estado mutable al cierre del día.
    pub fn cache_final_stats(&mut self, state: &SimulationState) {
        self.autos_atendidos = state.count_autos_atendidos;
        self.camionetas_atendidas = state.count_camionetas_atendidas;
        self.total_espera_autos = state.total_espera_autos;
        self.total_espera_camionetas = state.total_espera_camionetas;
    }

    /// Actualiza la longitud máxima de la cola de entrada del día.
    #[inline]
    pub fn update_max_cola(&mut self, state: &SimulationState) {
        let cola = state.entry_queue.len();
        if cola > self.max_cola {
            self.max_cola = cola;
        }
    }

    /// Reporte de texto con los valores cacheados.
    pub fn report_cached(&self) -> String {
        let mut out = vec![
            format!(
                "  Hora de fin de jornada: {} ({:.2} min)",
                self.hora_fin_jornada_hhmm(),
                self.fin_jornada.unwrap_or(0.0)
            ),
            format!("  Autos atendidos:        {}", self.autos_atendidos),
            format!("  Camionetas atendidas:   {}", self.camionetas_atendidas),
            format!("  Max cola del día:       {}", self.max_cola),
        ];
        for (i, l) in self.lines.iter().enumerate() {
            if l.bloqueo_frenos.is_some() {
                let id = i as u32 + 1;
                out.push(format!(
                    "  Bloqueo Frenos Línea {id}: {:.2}%",
                    self.porcentaje_bloqueo_frenos(id)
                ));
            }
        }
        out.join("\n")
    }
}

/// Acumula las estadísticas de todos los días de una simulación multi-día.
#[derive(Debug, Clone, Default)]
pub struct GlobalStatsAccumulator {
    total_espera_autos: f64,
    total_espera_camionetas: f64,
    count_autos: u64,
    count_camionetas: u64,

    pub total_autos_atendidos: u64,
    pub total_camionetas_atendidas: u64,

    /// Bloqueo global por línea: (acum_bloqueado, acum_duracion).
    bloqueo_frenos: Vec<Option<(f64, f64)>>,
    /// Servicio global por línea: (acum_frenos, acum_luces).
    servicio_linea: Vec<Option<(f64, f64)>>,

    suma_fins_jornada: f64,
    cant_fins_jornada: u64,
}

impl GlobalStatsAccumulator {
    /// Incorpora las estadísticas de un día al acumulador global.
    pub fn add_day(&mut self, tracker: &StatsTracker) {
        self.total_espera_autos += tracker.total_espera_autos;
        self.total_espera_camionetas += tracker.total_espera_camionetas;
        self.count_autos += tracker.autos_atendidos;
        self.count_camionetas += tracker.camionetas_atendidas;
        self.total_autos_atendidos += tracker.autos_atendidos;
        self.total_camionetas_atendidas += tracker.camionetas_atendidas;

        if let Some(fin) = tracker.fin_jornada {
            self.suma_fins_jornada += fin;
            self.cant_fins_jornada += 1;
        }

        let n = tracker.lines.len();
        if self.bloqueo_frenos.len() < n {
            self.bloqueo_frenos.resize(n, None);
            self.servicio_linea.resize(n, None);
        }

        let duracion = tracker.duracion_jornada();
        for (i, l) in tracker.lines.iter().enumerate() {
            // Igual que en Python: la duración solo se acumula en los días en
            // que la línea registró bloqueo.
            if let Some(bloqueado) = l.bloqueo_frenos {
                let (b, d) = self.bloqueo_frenos[i].unwrap_or((0.0, 0.0));
                self.bloqueo_frenos[i] = Some((b + bloqueado, d + duracion));
            }
            if l.servicio_frenos.is_some() || l.servicio_luces.is_some() {
                let (f, lu) = self.servicio_linea[i].unwrap_or((0.0, 0.0));
                self.servicio_linea[i] = Some((
                    f + l.servicio_frenos.unwrap_or(0.0),
                    lu + l.servicio_luces.unwrap_or(0.0),
                ));
            }
        }
    }

    pub fn promedio_espera_autos(&self) -> f64 {
        if self.count_autos == 0 {
            0.0
        } else {
            self.total_espera_autos / self.count_autos as f64
        }
    }

    pub fn promedio_espera_camionetas(&self) -> f64 {
        if self.count_camionetas == 0 {
            0.0
        } else {
            self.total_espera_camionetas / self.count_camionetas as f64
        }
    }

    pub fn promedio_fin_jornada(&self) -> Option<f64> {
        if self.cant_fins_jornada == 0 {
            None
        } else {
            Some(self.suma_fins_jornada / self.cant_fins_jornada as f64)
        }
    }

    pub fn promedio_fin_jornada_hhmm(&self) -> String {
        match self.promedio_fin_jornada() {
            None => "N/A".to_string(),
            Some(avg) => minutos_a_hhmm(avg),
        }
    }

    pub fn porcentaje_bloqueo_global(&self, line_id: u32) -> f64 {
        match self.bloqueo_frenos.get((line_id as usize).wrapping_sub(1)) {
            Some(Some((bloqueado, duracion))) if *duracion > 0.0 => bloqueado / duracion * 100.0,
            _ => 0.0,
        }
    }

    /// IDs de líneas que tuvieron bloqueo o servicio registrado (ordenados).
    pub fn all_line_ids(&self) -> Vec<u32> {
        (0..self.bloqueo_frenos.len())
            .filter(|&i| self.bloqueo_frenos[i].is_some() || self.servicio_linea[i].is_some())
            .map(|i| i as u32 + 1)
            .collect()
    }
}
