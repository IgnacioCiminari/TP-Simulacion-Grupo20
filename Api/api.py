"""
API HTTP de la Simulación de la Planta de Revisión Técnica Vehicular.

Expone dos endpoints:
  POST /simulacion  — Ejecuta una nueva simulación (descarta la anterior).
  GET  /simulacion  — Recupera registros paginados de la simulación activa.

Paginación (query params): offset (default 0), limit (default 50).
Las estadísticas de resumen siempre se incluyen en la respuesta.

Uso:
    uv run uvicorn api:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from core.simulation import Simulation, SimulationConfig

app = FastAPI(
    title="RTV Simulation API",
    description="API para ejecutar y consultar simulaciones de la Planta de Revisión Técnica Vehicular.",
    version="1.0.0",
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
    run_index: int = 1


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_response(offset: int, limit: int) -> dict:
    """Arma la respuesta paginada a partir de la simulación activa."""
    if _simulacion_activa is None:
        raise HTTPException(
            status_code=404,
            detail="No hay ninguna simulación ejecutada. Realizá primero un POST /simulacion.",
        )

    records = _simulacion_activa["records"]
    paginated = records[offset: offset + limit]

    return {
        "stats": _simulacion_activa["stats"],
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
        "Crea y ejecuta una simulación con los parámetros indicados. "
        "La simulación anterior (si existía) es reemplazada inmediatamente. "
        "Devuelve las estadísticas de resumen y la primera página de registros del vector de estado."
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

    # Correr la simulación (genera el CSV y acumula rows en memoria)
    sim = Simulation(config)
    tracker = sim.run()

    # Construir el objeto de estadísticas de resumen
    stats = {
        "fin_jornada_min": tracker.fin_jornada,
        "fin_jornada_hhmm": tracker.hora_fin_jornada_hhmm(),
        "promedio_espera_autos_min": tracker.promedio_espera_autos(sim.state),
        "promedio_espera_camionetas_min": tracker.promedio_espera_camionetas(sim.state),
        "autos_atendidos": sim.state.count_autos_atendidos,
        "camionetas_atendidas": sim.state.count_camionetas_atendidas,
        "porcentaje_bloqueo_frenos": {
            str(line_id): round(tracker.porcentaje_bloqueo_frenos(line_id), 4)
            for line_id in sorted(tracker.acum_bloqueo_frenos.keys())
        },
    }

    # Sobrescribir la simulación anterior sin piedad
    _simulacion_activa = {
        "stats": stats,
        "records": sim.exporter.rows,  # list[dict] ya construida por el exporter
    }

    return _build_response(offset, limit)


@app.get(
    "/simulacion",
    summary="Consultar la simulación activa",
    description=(
        "Devuelve registros paginados del vector de estado de la última simulación ejecutada. "
        "Las estadísticas de resumen siempre se incluyen en la respuesta, "
        "independientemente del rango de paginación solicitado."
    ),
)
def get_simulacion(
    offset: int = Query(default=0, ge=0, description="Índice del primer registro a devolver."),
    limit: int = Query(default=50, ge=1, description="Cantidad máxima de registros a devolver."),
) -> dict:
    return _build_response(offset, limit)
