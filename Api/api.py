"""
API HTTP de la Simulación de la Planta de Revisión Técnica Vehicular.

Expone tres endpoints:
  POST /simulacion              — Ejecuta una nueva simulación (descarta la anterior).
                                  Devuelve los registros del primer día.
  GET  /simulacion              — Recupera registros paginados de un día específico.
  GET  /estadisticas            — Devuelve las estadísticas de cada día simulado
                                  (para armar gráficos).

Paginación en GET /simulacion (query params): offset (default 0), limit (default 50).
El parámetro `dia` selecciona la jornada a consultar (default 1).

Uso:
    uv run uvicorn api:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.simulation import Simulation, SimulationConfig

app = FastAPI(
    title="RTV Simulation API",
    description="API para ejecutar y consultar simulaciones de la Planta de Revisión Técnica Vehicular.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# Base de datos en memoria — guarda únicamente la última simulación ejecutada.
# Se reemplaza por completo en cada POST.
# ─────────────────────────────────────────────────────────────────────────────

_simulacion_activa: dict | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Schema de entrada (todos los campos son opcionales — si no se envía nada,
# se usan los valores por defecto de SimulationConfig).
# ─────────────────────────────────────────────────────────────────────────────

class SimulationConfigIn(BaseModel):
    hora_apertura: float = 480.0
    hora_cierre_puertas: float = 960.0
    media_llegada_auto: float = 15.0
    media_llegada_camioneta: float = 30.0
    frenos_min: float = 4.0
    frenos_max: float = 7.0
    luces_min: float = 6.0
    luces_max: float = 10.0
    num_lineas: int = 2
    master_seed: int | None = 42
    max_dias: int = 10
    max_iteraciones: int = 1_000


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_stats_for_day(day_result) -> dict:
    """Construye el dict de estadísticas a partir de un DayResult."""
    tracker = day_result.tracker
    # El state ya no está disponible post-ejecución del día, pero el tracker
    # guarda los valores necesarios directamente.
    return {
        "dia": day_result.dia,
        "fin_jornada_min": tracker.fin_jornada,
        "fin_jornada_hhmm": tracker.hora_fin_jornada_hhmm(),
        "promedio_espera_autos_min": tracker.promedio_espera_autos_cached,
        "promedio_espera_camionetas_min": tracker.promedio_espera_camionetas_cached,
        "autos_atendidos": tracker.autos_atendidos,
        "camionetas_atendidas": tracker.camionetas_atendidas,
        "porcentaje_bloqueo_frenos": {
            str(line_id): round(tracker.porcentaje_bloqueo_frenos(line_id), 4)
            for line_id in sorted(tracker.acum_bloqueo_frenos.keys())
        },
    }


def _require_simulacion() -> dict:
    """Lanza 404 si no hay simulación activa; si la hay, la devuelve."""
    if _simulacion_activa is None:
        raise HTTPException(
            status_code=404,
            detail="No hay ninguna simulación ejecutada. Realizá primero un POST /simulacion.",
        )
    return _simulacion_activa


def _build_day_response(dia: int, offset: int, limit: int) -> dict:
    """Arma la respuesta paginada de un día concreto."""
    sim = _require_simulacion()

    if dia not in sim["rows_by_day"]:
        dias_disponibles = sorted(sim["rows_by_day"].keys())
        raise HTTPException(
            status_code=404,
            detail=f"El día {dia} no existe en la simulación activa. Días disponibles: {dias_disponibles}.",
        )

    records = sim["rows_by_day"][dia]
    paginated = records[offset: offset + limit]
    stats_dia = next((s for s in sim["stats_por_dia"] if s["dia"] == dia), None)

    return {
        "dia": dia,
        "stats": stats_dia,
        "pagination": {
            "offset": offset,
            "limit": limit,
            "total_records": len(records),
        },
        "records": paginated,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get(
    "/",
    summary="Health Check",
    description="Endpoint para verificar que la API está funcionando correctamente."
)
def read_root():
    return {
        "status": "online",
        "message": "API de Simulación RTV corriendo correctamente en el puerto 8000."
    }


@app.post(
    "/simulacion",
    summary="Ejecutar una nueva simulación",
    description=(
        "Crea y ejecuta una simulación multi-día con los parámetros indicados. "
        "La simulación se detiene cuando se cumple CUALQUIERA de las condiciones: "
        "`max_dias` días completados o `max_iteraciones` iteraciones acumuladas "
        "(el día en curso siempre se completa antes de cortar). "
        "La simulación anterior (si existía) es reemplazada inmediatamente. "
        "Devuelve los registros paginados del Día 1."
    ),
)
def run_simulacion(
    config_in: SimulationConfigIn | None = None,
    offset: int = Query(default=0, ge=0, description="Índice del primer registro a devolver."),
    limit: int = Query(default=50, ge=1, description="Cantidad máxima de registros a devolver."),
) -> dict:
    global _simulacion_activa

    # Construir la configuración de simulación
    params = config_in.model_dump() if config_in else {}
    config = SimulationConfig(**params)

    # Correr la simulación multi-día
    sim = Simulation(config)
    results = sim.run()

    # Cachear los promedios en el tracker (necesitamos el state para calcularlos;
    # lo hacemos en el momento en que aún están disponibles en _run_single_day).
    # Los trackers ya tienen los valores cacheados en esta versión.
    stats_por_dia = [_build_stats_for_day(r) for r in results]
    rows_by_day = {r.dia: r.rows for r in results}

    _simulacion_activa = {
        "stats_por_dia": stats_por_dia,
        "rows_by_day": rows_by_day,
        "total_dias": len(results),
    }

    return _build_day_response(dia=1, offset=offset, limit=limit)


@app.get(
    "/simulacion",
    summary="Consultar registros de un día de la simulación activa",
    description=(
        "Devuelve registros paginados del vector de estado del día indicado. "
        "Las estadísticas de ese día siempre se incluyen en la respuesta. "
        "Usá el parámetro `dia` para elegir la jornada (default: 1)."
    ),
)
def get_simulacion(
    dia: int = Query(default=1, ge=1, description="Número de día a consultar."),
    offset: int = Query(default=0, ge=0, description="Índice del primer registro a devolver."),
    limit: int = Query(default=50, ge=1, description="Cantidad máxima de registros a devolver."),
) -> dict:
    _require_simulacion()
    return _build_day_response(dia=dia, offset=offset, limit=limit)


@app.get(
    "/estadisticas",
    summary="Estadísticas de todos los días simulados",
    description=(
        "Devuelve un array con las estadísticas de cada jornada simulada, "
        "incluyendo la hora real de finalización, el tiempo promedio de espera "
        "en cola por tipo de vehículo y el porcentaje de bloqueo por estación de Frenos. "
        "Diseñado para alimentar gráficos comparativos entre días."
    ),
)
def get_estadisticas() -> dict:
    sim = _require_simulacion()
    return {
        "total_dias": sim["total_dias"],
        "estadisticas": sim["stats_por_dia"],
    }
