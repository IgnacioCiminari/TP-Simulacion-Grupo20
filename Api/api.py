"""
API HTTP de la Simulación de la Planta de Revisión Técnica Vehicular.

Endpoints:
  POST /simulacion              — Ejecuta una nueva simulación (descarta la anterior).
                                  Devuelve estadísticas globales + día 1 paginado.
  GET  /simulacion              — Recupera registros paginados de un día específico.
  GET  /simulacion/ultimo_registro — Devuelve el último registro generado en toda la simulación.
  GET  /simulacion/exportar     — Descarga el vector de estado completo como CSV.
  GET  /estadisticas            — Devuelve las estadísticas de cada día simulado.
  GET  /estadisticas_globales   — Devuelve las estadísticas globales de la simulación activa.

Paginación en GET /simulacion (query params): offset (default 0), limit (default 50).
El parámetro `dia` selecciona la jornada a consultar (default 1).

Uso:
    uv run uvicorn api:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.simulation import Simulation, SimulationConfig

app = FastAPI(
    title="RTV Simulation API",
    description="API para ejecutar y consultar simulaciones de la Planta de Revisión Técnica Vehicular.",
    version="3.0.0",
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
# Schema de entrada (seed excluida — siempre fija internamente).
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
    max_dias: int = 10
    max_iteraciones: int = 1_000


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _format_elapsed(seconds: float) -> str:
    """
    Formatea el tiempo de ejecución en un string legible.
    Si supera 60 segundos, devuelve 'M:SS,cc'; si no, 'SS,cc s'.
    """
    if seconds >= 60:
        total_cs = round(seconds * 100)
        mins = total_cs // 6000
        secs = (total_cs % 6000) // 100
        cs = total_cs % 100
        return f"{mins}:{secs:02d},{cs:02d}"
    else:
        return f"{seconds:.2f} s"


def _build_stats_for_day(day_result) -> dict:
    """Construye el dict de estadísticas a partir de un DayResult."""
    tracker = day_result.tracker
    line_ids = sorted(
        set(tracker.acum_bloqueo_frenos.keys())
        | set(tracker.acum_servicio_frenos.keys())
        | set(tracker.acum_servicio_luces.keys())
    )
    return {
        "dia": day_result.dia,
        "fin_jornada_min": tracker.fin_jornada,
        "fin_jornada_hhmm": tracker.hora_fin_jornada_hhmm(),
        "autos_atendidos": tracker.autos_atendidos,
        "camionetas_atendidas": tracker.camionetas_atendidas,
        "max_cola": tracker.max_cola,
        "promedio_espera_autos_min": round(tracker.promedio_espera_autos(), 4),
        "promedio_espera_camionetas_min": round(tracker.promedio_espera_camionetas(), 4),
        "porcentaje_bloqueo_frenos": {
            str(line_id): round(tracker.porcentaje_bloqueo_frenos(line_id), 4)
            for line_id in line_ids
        },
        "servicio_frenos_min": {
            str(line_id): round(tracker.acum_servicio_frenos.get(line_id, 0.0), 4)
            for line_id in line_ids
        },
        "servicio_luces_min": {
            str(line_id): round(tracker.acum_servicio_luces.get(line_id, 0.0), 4)
            for line_id in line_ids
        },
        "total_servicio_min": {
            str(line_id): round(tracker.total_servicio_linea(line_id), 4)
            for line_id in line_ids
        },
    }


def _build_global_stats(sim: dict) -> dict:
    """Construye el dict de estadísticas globales desde el store en memoria."""
    gs = sim["global_stats_obj"]
    return {
        "total_dias": sim["total_dias"],
        "total_autos_atendidos": gs.total_autos_atendidos,
        "total_camionetas_atendidas": gs.total_camionetas_atendidas,
        "promedio_espera_autos_min": round(gs.promedio_espera_autos, 4),
        "promedio_espera_camionetas_min": round(gs.promedio_espera_camionetas, 4),
        "promedio_fin_jornada_min": round(gs.promedio_fin_jornada, 2) if gs.promedio_fin_jornada else None,
        "promedio_fin_jornada_hhmm": gs.promedio_fin_jornada_hhmm(),
        "porcentaje_bloqueo_global": gs.porcentaje_bloqueo_global_dict(),
        "tiempo_ejecucion": sim["tiempo_ejecucion"],
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
        "Devuelve las estadísticas globales de la simulación completa, más los "
        "registros paginados del Día 1, y el último registro de toda la simulación."
    ),
)
def run_simulacion(
    config_in: SimulationConfigIn | None = None,
    offset: int = Query(default=0, ge=0, description="Índice del primer registro a devolver."),
    limit: int = Query(default=50, ge=1, description="Cantidad máxima de registros a devolver."),
) -> dict:
    global _simulacion_activa

    # Construir la configuración de simulación (seed siempre fija internamente)
    params = config_in.model_dump() if config_in else {}
    config = SimulationConfig(**params)

    # Correr la simulación multi-día
    sim = Simulation(config)
    results, global_stats = sim.run()

    stats_por_dia = [_build_stats_for_day(r) for r in results]
    rows_by_day = {r.dia: r.rows for r in results}

    _simulacion_activa = {
        "stats_por_dia": stats_por_dia,
        "rows_by_day": rows_by_day,
        "total_dias": len(results),
        "global_stats_obj": global_stats,
        "tiempo_ejecucion": _format_elapsed(sim.elapsed_seconds),
        "exporter": sim.exporter,   # referencia para exportar CSV sin re-simular
        "last_row": sim.exporter.last_row,
    }

    day_response = _build_day_response(dia=1, offset=offset, limit=limit)

    return {
        **day_response,
        "total_dias_simulados": len(results),
        "estadisticas_globales": _build_global_stats(_simulacion_activa),
        "ultimo_registro": _simulacion_activa["last_row"],
    }


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
    "/simulacion/ultimo_registro",
    summary="Último registro de la simulación activa",
    description=(
        "Devuelve el último evento registrado en toda la simulación, "
        "independientemente del día. Útil para la fila sticky en la tabla del front."
    ),
)
def get_ultimo_registro() -> dict:
    sim = _require_simulacion()
    last = sim.get("last_row")
    if last is None:
        raise HTTPException(status_code=404, detail="No hay registros disponibles.")
    return {"ultimo_registro": last}


@app.get(
    "/simulacion/exportar",
    summary="Exportar vector de estado como CSV",
    description=(
        "Genera y descarga el archivo CSV completo con todos los registros de la "
        "simulación activa. El CSV se genera al vuelo desde la memoria RAM sin "
        "necesidad de re-simular."
    ),
)
def exportar_csv():
    sim = _require_simulacion()
    exporter = sim.get("exporter")
    if exporter is None:
        raise HTTPException(status_code=500, detail="El exporter no está disponible.")

    csv_bytes = exporter.generate_csv_bytes()

    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=vector_de_estado.csv"},
    )


@app.get(
    "/estadisticas",
    summary="Estadísticas de todos los días simulados",
    description=(
        "Devuelve un array con las estadísticas de cada jornada simulada, "
        "incluyendo la hora real de finalización, autos y camionetas atendidas, "
        "longitud máxima de cola del día y el porcentaje de bloqueo por estación de Frenos. "
        "Diseñado para alimentar gráficos comparativos entre días."
    ),
)
def get_estadisticas() -> dict:
    sim = _require_simulacion()
    return {
        "total_dias": sim["total_dias"],
        "estadisticas": sim["stats_por_dia"],
    }


@app.get(
    "/estadisticas_globales",
    summary="Estadísticas globales de la simulación activa",
    description=(
        "Devuelve las estadísticas agregadas de toda la simulación activa: "
        "totales de vehículos atendidos, promedios de espera globales, "
        "promedio de hora de fin de jornada y porcentajes de bloqueo globales. "
        "Disponible sin necesidad de re-ejecutar la simulación."
    ),
)
def get_estadisticas_globales() -> dict:
    sim = _require_simulacion()
    return _build_global_stats(sim)
