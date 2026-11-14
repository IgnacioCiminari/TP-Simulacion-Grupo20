//! API HTTP de la Simulación de la Planta de Revisión Técnica Vehicular.
//!
//! Mismos endpoints y mismo formato de respuesta que `Api/api.py`:
//!   POST /simulacion                 — Lanza una simulación en background → {status: "started"}.
//!   GET  /simulacion/progreso        — Estado de avance (idle | running | done | error).
//!   GET  /simulacion                 — Registros paginados de un día (dia, offset, limit).
//!   GET  /simulacion/ultimo_registro — Último registro de toda la simulación.
//!   POST /simulacion/exportar        — Guarda el vector de estado completo en output/.
//!   GET  /estadisticas               — Estadísticas de cada día simulado.
//!   GET  /estadisticas/top_bloqueo   — Top N días con mayor % de bloqueo de frenos.
//!   GET  /estadisticas_globales      — Estadísticas globales de la simulación activa.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::BufWriter;
use std::panic::{self, AssertUnwindSafe};
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};

use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tower_http::cors::{AllowHeaders, AllowMethods, CorsLayer};

use crate::core::simulation::{DayResult, Simulation, SimulationConfig};
use crate::stats::exporter::FormattedRow;
use crate::stats::tracker::py_round;

// ─────────────────────────────────────────────────────────────────────────────
// Estado en memoria — guarda únicamente la última simulación ejecutada.
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct Progreso {
    pub status: &'static str, // idle | running | done | error
    pub dias_completados: u64,
    pub max_dias: i64,
    pub iteraciones_completadas: u64,
    pub max_iteraciones: i64,
    pub error_detail: Option<String>,
}

impl Default for Progreso {
    fn default() -> Self {
        Self {
            status: "idle",
            dias_completados: 0,
            max_dias: 0,
            iteraciones_completadas: 0,
            max_iteraciones: 0,
            error_detail: None,
        }
    }
}

pub struct SimulacionActiva {
    pub sim: Simulation,
    pub tiempo_ejecucion: String,
}

#[derive(Default)]
struct Inner {
    progreso: Progreso,
    simulacion: Option<Arc<SimulacionActiva>>,
    /// Se incrementa en cada POST: una simulación reemplazada se cancela.
    generacion: u64,
}

#[derive(Clone, Default)]
pub struct AppState(Arc<Mutex<Inner>>);

impl AppState {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Errores con el mismo formato que FastAPI: {"detail": ...}
// ─────────────────────────────────────────────────────────────────────────────

pub struct ApiError {
    status: StatusCode,
    detail: Value,
}

impl ApiError {
    fn not_found(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            detail: Value::String(msg.into()),
        }
    }

    fn internal(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            detail: Value::String(msg.into()),
        }
    }

    fn validation(loc: &[&str], msg: impl Into<String>, input: Value) -> Self {
        Self {
            status: StatusCode::UNPROCESSABLE_ENTITY,
            detail: json!([{ "type": "value_error", "loc": loc, "msg": msg.into(), "input": input }]),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "detail": self.detail }))).into_response()
    }
}

type ApiResult<T> = Result<T, ApiError>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema de entrada (seed excluida — siempre fija internamente).
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct SimulationConfigIn {
    hora_apertura: Option<f64>,
    hora_cierre_puertas: Option<f64>,
    media_llegada_auto: Option<f64>,
    media_llegada_camioneta: Option<f64>,
    frenos_min: Option<f64>,
    frenos_max: Option<f64>,
    luces_min: Option<f64>,
    luces_max: Option<f64>,
    num_lineas: Option<f64>,
    max_dias: Option<f64>,
    max_iteraciones: Option<f64>,
}

fn as_int(name: &str, value: Option<f64>, default: i64) -> ApiResult<i64> {
    match value {
        None => Ok(default),
        Some(v) if v.is_finite() && v.fract() == 0.0 => Ok(v as i64),
        Some(v) => Err(ApiError::validation(
            &["body", name],
            "Input should be a valid integer, got a number with a fractional part",
            json!(v),
        )),
    }
}

impl SimulationConfigIn {
    /// Devuelve la configuración y los valores crudos de max_dias / max_iteraciones.
    fn into_config(self) -> ApiResult<(SimulationConfig, i64, i64)> {
        let d = SimulationConfig {
            max_dias: 1000,
            max_iteraciones: 100_000,
            ..SimulationConfig::default()
        };
        let num_lineas = as_int("num_lineas", self.num_lineas, d.num_lineas as i64)?;
        let max_dias = as_int("max_dias", self.max_dias, d.max_dias as i64)?;
        let max_iter = as_int("max_iteraciones", self.max_iteraciones, d.max_iteraciones as i64)?;
        let config = SimulationConfig {
            hora_apertura: self.hora_apertura.unwrap_or(d.hora_apertura),
            hora_cierre_puertas: self.hora_cierre_puertas.unwrap_or(d.hora_cierre_puertas),
            media_llegada_auto: self.media_llegada_auto.unwrap_or(d.media_llegada_auto),
            media_llegada_camioneta: self
                .media_llegada_camioneta
                .unwrap_or(d.media_llegada_camioneta),
            frenos_min: self.frenos_min.unwrap_or(d.frenos_min),
            frenos_max: self.frenos_max.unwrap_or(d.frenos_max),
            luces_min: self.luces_min.unwrap_or(d.luces_min),
            luces_max: self.luces_max.unwrap_or(d.luces_max),
            num_lineas: num_lineas.max(0) as usize,
            master_seed: d.master_seed,
            max_dias: max_dias.max(0) as u64,
            max_iteraciones: max_iter.max(0) as u64,
        };
        Ok((config, max_dias, max_iter))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// `M:SS,cc` si supera 60 segundos; si no, `SS.cc s` (igual que Python).
pub fn format_elapsed(seconds: f64) -> String {
    if seconds >= 60.0 {
        let total_cs = (seconds * 100.0).round_ties_even() as u64;
        format!(
            "{}:{:02},{:02}",
            total_cs / 6000,
            (total_cs % 6000) / 100,
            total_cs % 100
        )
    } else {
        format!("{seconds:.2} s")
    }
}

fn per_line_map(ids: &[u32], f: impl Fn(u32) -> f64) -> Map<String, Value> {
    ids.iter()
        .map(|&id| (id.to_string(), json!(py_round(f(id), 4))))
        .collect()
}

#[derive(Serialize)]
pub struct DayStatsOut {
    dia: u64,
    fin_jornada_min: Option<f64>,
    fin_jornada_hhmm: String,
    autos_atendidos: u64,
    camionetas_atendidas: u64,
    max_cola: usize,
    promedio_espera_autos_min: f64,
    promedio_espera_camionetas_min: f64,
    porcentaje_bloqueo_frenos: Map<String, Value>,
    servicio_frenos_min: Map<String, Value>,
    servicio_luces_min: Map<String, Value>,
    total_servicio_min: Map<String, Value>,
}

pub fn build_stats_for_day(day: &DayResult) -> DayStatsOut {
    let t = &day.tracker;
    let ids = t.line_ids();
    DayStatsOut {
        dia: day.dia,
        fin_jornada_min: t.fin_jornada,
        fin_jornada_hhmm: t.hora_fin_jornada_hhmm(),
        autos_atendidos: t.autos_atendidos,
        camionetas_atendidas: t.camionetas_atendidas,
        max_cola: t.max_cola,
        promedio_espera_autos_min: py_round(t.promedio_espera_autos(), 4),
        promedio_espera_camionetas_min: py_round(t.promedio_espera_camionetas(), 4),
        porcentaje_bloqueo_frenos: per_line_map(&ids, |id| t.porcentaje_bloqueo_frenos(id)),
        servicio_frenos_min: per_line_map(&ids, |id| t.acum_servicio_frenos(id)),
        servicio_luces_min: per_line_map(&ids, |id| t.acum_servicio_luces(id)),
        total_servicio_min: per_line_map(&ids, |id| t.total_servicio_linea(id)),
    }
}

fn build_global_stats(activa: &SimulacionActiva) -> Value {
    let sim = &activa.sim;
    let gs = &sim.global_stats;
    let ids = gs.all_line_ids();
    let promedio_fin = gs
        .promedio_fin_jornada()
        .filter(|v| *v != 0.0)
        .map(|v| py_round(v, 2));
    json!({
        "total_dias": sim.total_dias(),
        "total_autos_atendidos": gs.total_autos_atendidos,
        "total_camionetas_atendidas": gs.total_camionetas_atendidas,
        "promedio_espera_autos_min": py_round(gs.promedio_espera_autos(), 4),
        "promedio_espera_camionetas_min": py_round(gs.promedio_espera_camionetas(), 4),
        "promedio_fin_jornada_min": promedio_fin,
        "promedio_fin_jornada_hhmm": gs.promedio_fin_jornada_hhmm(),
        "porcentaje_bloqueo_global": per_line_map(&ids, |id| gs.porcentaje_bloqueo_global(id)),
        "tiempo_ejecucion": activa.tiempo_ejecucion,
    })
}

fn require_simulacion(app: &AppState) -> ApiResult<Arc<SimulacionActiva>> {
    app.lock().simulacion.clone().ok_or_else(|| {
        ApiError::not_found(
            "No hay ninguna simulación ejecutada. Realizá primero un POST /simulacion.",
        )
    })
}

fn int_param(
    params: &HashMap<String, String>,
    name: &str,
    default: i64,
    ge: i64,
    le: Option<i64>,
) -> ApiResult<i64> {
    let Some(raw) = params.get(name) else {
        return Ok(default);
    };
    let v: i64 = raw.trim().parse().map_err(|_| {
        ApiError::validation(
            &["query", name],
            "Input should be a valid integer, unable to parse string as an integer",
            json!(raw),
        )
    })?;
    if v < ge {
        return Err(ApiError::validation(
            &["query", name],
            format!("Input should be greater than or equal to {ge}"),
            json!(raw),
        ));
    }
    if let Some(le) = le {
        if v > le {
            return Err(ApiError::validation(
                &["query", name],
                format!("Input should be less than or equal to {le}"),
                json!(raw),
            ));
        }
    }
    Ok(v)
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────────────────────────────────────

async fn read_root() -> Json<Value> {
    Json(json!({
        "status": "online",
        "message": "API de Simulación RTV corriendo correctamente en el puerto 8000.",
    }))
}

async fn run_simulacion(State(app): State<AppState>, body: Bytes) -> ApiResult<Json<Value>> {
    // Body opcional: vacío o `null` → valores por defecto.
    let config_in: SimulationConfigIn = if body.iter().all(u8::is_ascii_whitespace) {
        SimulationConfigIn::default()
    } else {
        let raw: Value = serde_json::from_slice(&body)
            .map_err(|e| ApiError::validation(&["body"], format!("JSON decode error: {e}"), Value::Null))?;
        if raw.is_null() {
            SimulationConfigIn::default()
        } else {
            serde_json::from_value(raw.clone())
                .map_err(|e| ApiError::validation(&["body"], e.to_string(), raw))?
        }
    };
    let (config, max_dias, max_iter) = config_in.into_config()?;

    let generacion = {
        let mut inner = app.lock();
        inner.generacion += 1;
        inner.progreso = Progreso {
            status: "running",
            dias_completados: 0,
            max_dias,
            iteraciones_completadas: 0,
            max_iteraciones: max_iter,
            error_detail: None,
        };
        inner.simulacion = None;
        inner.generacion
    };

    let app_bg = app.clone();
    std::thread::spawn(move || {
        let resultado = panic::catch_unwind(AssertUnwindSafe(|| {
            let mut sim = Simulation::new(config);
            let completa = sim.run(|dia, total_iteraciones| {
                let mut inner = app_bg.lock();
                if inner.generacion != generacion {
                    return false; // reemplazada por una simulación más nueva
                }
                inner.progreso.dias_completados = dia;
                inner.progreso.iteraciones_completadas = total_iteraciones;
                true
            });
            completa.then_some(sim)
        }));

        let mut inner = app_bg.lock();
        if inner.generacion != generacion {
            return;
        }
        match resultado {
            Ok(Some(sim)) => {
                inner.progreso.status = "done";
                inner.progreso.dias_completados = sim.total_dias();
                inner.progreso.iteraciones_completadas = sim.total_iteraciones;
                let tiempo_ejecucion = format_elapsed(sim.elapsed_seconds);
                inner.simulacion = Some(Arc::new(SimulacionActiva {
                    sim,
                    tiempo_ejecucion,
                }));
            }
            Ok(None) => {}
            Err(e) => {
                let msg = e
                    .downcast_ref::<String>()
                    .cloned()
                    .or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string()))
                    .unwrap_or_else(|| "Error interno en la simulación".to_string());
                inner.progreso.status = "error";
                inner.progreso.error_detail = Some(msg);
            }
        }
    });

    Ok(Json(json!({ "status": "started" })))
}

async fn get_progreso(State(app): State<AppState>) -> Json<Progreso> {
    Json(app.lock().progreso.clone())
}

#[derive(Serialize)]
struct Pagination {
    offset: usize,
    limit: usize,
    total_records: usize,
}

#[derive(Serialize)]
struct DayResponse<'a> {
    dia: u64,
    stats: DayStatsOut,
    pagination: Pagination,
    records: Vec<FormattedRow<'a>>,
}

async fn get_simulacion(
    State(app): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let activa = require_simulacion(&app)?;
    let dia = int_param(&params, "dia", 1, 1, None)? as u64;
    let offset = int_param(&params, "offset", 0, 0, None)? as usize;
    let limit = int_param(&params, "limit", 50, 1, None)? as usize;

    let sim = &activa.sim;
    let Some(day) = sim.day(dia) else {
        let dias: Vec<String> = (1..=sim.total_dias()).map(|d| d.to_string()).collect();
        return Err(ApiError::not_found(format!(
            "El día {dia} no existe en la simulación activa. Días disponibles: [{}].",
            dias.join(", ")
        )));
    };

    let rows = sim.replay_day(dia).unwrap_or_default();
    let total = rows.len();
    let ini = offset.min(total);
    let fin = offset.saturating_add(limit).min(total);

    let resp = DayResponse {
        dia,
        stats: build_stats_for_day(day),
        pagination: Pagination {
            offset,
            limit,
            total_records: total,
        },
        records: rows[ini..fin].iter().map(|r| sim.exporter.format_row(r)).collect(),
    };
    Ok(Json(resp).into_response())
}

async fn get_ultimo_registro(State(app): State<AppState>) -> ApiResult<Response> {
    let activa = require_simulacion(&app)?;
    let sim = &activa.sim;
    let last = sim
        .last_row()
        .ok_or_else(|| ApiError::not_found("No hay registros disponibles."))?;
    Ok(Json(json!({ "ultimo_registro": sim.exporter.format_row(&last) })).into_response())
}

async fn exportar_csv(State(app): State<AppState>) -> ApiResult<Json<Value>> {
    let activa = require_simulacion(&app)?;
    tokio::task::spawn_blocking(move || -> std::io::Result<()> {
        fs::create_dir_all("output")?;
        let file = File::create(Path::new("output").join("vector_de_estado.csv"))?;
        let mut writer = BufWriter::with_capacity(1 << 20, file);
        activa.sim.write_csv(&mut writer)
    })
    .await
    .map_err(|e| ApiError::internal(e.to_string()))?
    .map_err(|e| ApiError::internal(format!("No se pudo escribir el CSV: {e}")))?;

    Ok(Json(json!({
        "status": "success",
        "message": "CSV guardado exitosamente en output/vector_de_estado.csv",
    })))
}

async fn get_estadisticas(State(app): State<AppState>) -> ApiResult<Response> {
    let activa = require_simulacion(&app)?;
    let sim = &activa.sim;
    let stats: Vec<DayStatsOut> = sim.results.iter().map(build_stats_for_day).collect();
    Ok(Json(json!({ "total_dias": sim.total_dias(), "estadisticas": stats })).into_response())
}

async fn get_top_bloqueo(
    State(app): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let activa = require_simulacion(&app)?;
    let n = int_param(&params, "n", 10, 1, Some(100))? as usize;
    let sim = &activa.sim;

    // Suma de los % de bloqueo (redondeados, como en el dict de Python) por día.
    let mut ranking: Vec<(f64, &DayResult)> = sim
        .results
        .iter()
        .map(|d| {
            let suma: f64 = d
                .tracker
                .line_ids()
                .iter()
                .map(|&id| py_round(d.tracker.porcentaje_bloqueo_frenos(id), 4))
                .sum();
            (suma, d)
        })
        .collect();
    // Orden estable descendente (igual que sorted(..., reverse=True)).
    ranking.sort_by(|a, b| b.0.total_cmp(&a.0));
    let top: Vec<DayStatsOut> = ranking
        .into_iter()
        .take(n)
        .map(|(_, d)| build_stats_for_day(d))
        .collect();

    Ok(Json(json!({ "total_dias": sim.total_dias(), "n": n, "estadisticas": top })).into_response())
}

async fn get_estadisticas_globales(State(app): State<AppState>) -> ApiResult<Json<Value>> {
    let activa = require_simulacion(&app)?;
    Ok(Json(build_global_stats(&activa)))
}

fn cors() -> CorsLayer {
    CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://localhost"), // Frontend en Docker (Nginx, puerto 80)
            HeaderValue::from_static("http://localhost:5173"), // Frontend en desarrollo (Vite)
        ])
        .allow_credentials(true)
        .allow_methods(AllowMethods::mirror_request())
        .allow_headers(AllowHeaders::mirror_request())
}

/// Construye el router con todos los endpoints.
pub fn router() -> Router {
    Router::new()
        .route("/", get(read_root))
        .route("/simulacion", post(run_simulacion).get(get_simulacion))
        .route("/simulacion/progreso", get(get_progreso))
        .route("/simulacion/ultimo_registro", get(get_ultimo_registro))
        .route("/simulacion/exportar", post(exportar_csv))
        .route("/estadisticas", get(get_estadisticas))
        .route("/estadisticas/top_bloqueo", get(get_top_bloqueo))
        .route("/estadisticas_globales", get(get_estadisticas_globales))
        .layer(cors())
        .with_state(AppState::default())
}
