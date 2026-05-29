from __future__ import annotations

import csv
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.simulation import SimulationConfig
    from core.state import SimulationState
    from core.fel import EventQueue
    from stats.tracker import StatsTracker


# ---------------------------------------------------------------------------
# Encabezado del CSV
# Orden: Dia | Evento | Reloj | [Llegadas: RND, Tiempo, Hora] | [Colas] |
#        [Por línea: Frenos(RND, Tiempo, Estado, Vehículo, FinAtencion),
#                    Luces(RND, Tiempo, Estado, Vehículo, FinAtencion)] |
#        [Estadísticas] | [Clientes activos serializado]
# ---------------------------------------------------------------------------

_HEADER_FIXED = [
    "Dia",
    "Evento",
    "Reloj_min",
    # ── Llegada Auto ──────────────────────────────────────────────────────
    "RND_Llegada_Auto",
    "Tiempo_Entre_Llegadas_Auto",
    "Prox_Llegada_Auto",
    # ── Llegada Camioneta ─────────────────────────────────────────────────
    "RND_Llegada_Camioneta",
    "Tiempo_Entre_Llegadas_Camioneta",
    "Prox_Llegada_Camioneta",
    # ── Colas ─────────────────────────────────────────────────────────────
    "Cola_Autos",
    "Cola_Camionetas",
]

# Columnas por línea (se repiten para L1, L2, ... según num_lineas)
_HEADER_PER_LINE = [
    "RND_Frenos_L{i}",
    "Tiempo_Frenos_L{i}",
    "Estado_Frenos_L{i}",
    "Vehiculo_Frenos_L{i}",
    "Fin_Atencion_Frenos_L{i}",
    "RND_Luces_L{i}",
    "Tiempo_Luces_L{i}",
    "Estado_Luces_L{i}",
    "Vehiculo_Luces_L{i}",
    "Fin_Atencion_Luces_L{i}",
]

_HEADER_STATS = [
    "Cant_Autos_Atendidos",
    "Cant_Camionetas_Atendidas",
    "Tiempo_Espera_Auto",
    "Acum_Espera_Autos",
    "Tiempo_Espera_Camioneta",
    "Acum_Espera_Camionetas",
    # Bloqueo por línea se agrega dinámicamente (Tiempo_Bloqueo_Li, Acum_Bloqueo_Li)
]

_HEADER_CLIENTES = ["Clientes_Activos"]


def _fmt(value: float | None, decimals: int = 4) -> str:
    """Formatea un float a string con N decimales, o vacío si None."""
    if value is None:
        return ""
    return f"{value:.{decimals}f}"


class CsvExporter:
    """
    Genera el archivo CSV del vector de estado de la simulación multi-día.
    Cada fila corresponde a una transición de estado (procesamiento de un evento)
    e incluye la columna `Dia` para identificar a qué jornada pertenece.

    Para cada variable aleatoria muestreada en el evento se incluyen tres columnas:
      RND_<var>   — número uniforme U(0,1) base usado en la transformada inversa.
      Tiempo_<var> — duración/tiempo generado por la distribución.
      Prox/Fin     — hora absoluta resultante (ya existía como columna anterior).
    """

    def __init__(self, output_path: str) -> None:
        self.output_path = output_path
        self._file = None
        self._writer = None
        self._num_lineas: int = 2  # se actualiza en write_header
        self.headers: list[str] = []   # cabeceras del CSV

        # Vector de estado en memoria: todos los días indexados
        # {dia: list[dict]}
        self.rows_by_day: dict[int, list[dict]] = {}

        # Filas del día actual (se reinicia en start_day)
        self.current_day_rows: list[dict] = []

    def write_header(self, state: "SimulationState", config: "SimulationConfig") -> None:
        """Crea el archivo de salida y escribe la fila de encabezados."""
        self._num_lineas = config.num_lineas
        os.makedirs(os.path.dirname(self.output_path), exist_ok=True)
        self._file = open(self.output_path, "w", newline="", encoding="utf-8")
        self._writer = csv.writer(self._file)

        header = list(_HEADER_FIXED)

        # Agregar columnas por línea
        for i in range(1, self._num_lineas + 1):
            for col in _HEADER_PER_LINE:
                header.append(col.replace("{i}", str(i)))

        # Estadísticas fijas
        header.extend(_HEADER_STATS)
        for i in range(1, self._num_lineas + 1):
            header.append(f"Tiempo_Bloqueo_L{i}")
            header.append(f"Acum_Bloqueo_Frenos_L{i}")

        header.extend(_HEADER_CLIENTES)
        self.headers = header          # guardar para el mapeo en memoria
        self.rows_by_day = {}          # reiniciar el índice multi-día
        self._writer.writerow(header)

    def start_day(self, dia: int) -> None:
        """Prepara el exporter para recibir las filas del día indicado."""
        self.current_day_rows = []
        self.rows_by_day[dia] = self.current_day_rows

    def write_row(
        self,
        event_name: str,
        state: "SimulationState",
        tracker: "StatsTracker",
        config: "SimulationConfig",
        fel: "EventQueue",
        row_context: dict[str, float | None],
        dia: int,
    ) -> None:
        """Serializa el vector de estado actual y lo escribe como una fila CSV."""
        row: list[str] = []

        # ── Día ───────────────────────────────────────────────────────────
        row.append(str(dia))

        # ── Evento y reloj ────────────────────────────────────────────────
        row.append(event_name)
        row.append(_fmt(state.clock, 2))

        # ── Llegada Auto: RND, tiempo, próxima hora ───────────────────────
        row.append(_fmt(row_context.get("rnd_llegada_auto"), 4))
        row.append(_fmt(row_context.get("tiempo_llegada_auto"), 4))
        row.append(_fmt(state.prox_llegada_auto, 2))

        # ── Llegada Camioneta: RND, tiempo, próxima hora ──────────────────
        row.append(_fmt(row_context.get("rnd_llegada_camioneta"), 4))
        row.append(_fmt(row_context.get("tiempo_llegada_camioneta"), 4))
        row.append(_fmt(state.prox_llegada_camioneta, 2))

        # ── Colas ─────────────────────────────────────────────────────────
        row.append(str(state.entry_queue.count_autos()))
        row.append(str(state.entry_queue.count_camionetas()))

        # ── Por línea ─────────────────────────────────────────────────────
        for line in state.lines:
            lid = line.id

            # Frenos: RND, tiempo, estado, vehículo, fin atención
            row.append(_fmt(row_context.get(f"rnd_frenos_l{lid}"), 4))
            row.append(_fmt(row_context.get(f"tiempo_frenos_l{lid}"), 4))
            row.append(line.frenos.status.value)
            v_frenos = line.frenos.current_vehicle
            row.append(str(v_frenos.id) if v_frenos else "")
            row.append(_fmt(line.frenos.hora_fin_atencion, 2))

            # Luces: RND, tiempo, estado, vehículo, fin atención
            row.append(_fmt(row_context.get(f"rnd_luces_l{lid}"), 4))
            row.append(_fmt(row_context.get(f"tiempo_luces_l{lid}"), 4))
            row.append(line.luces.status.value)
            v_luces = line.luces.current_vehicle
            row.append(str(v_luces.id) if v_luces else "")
            row.append(_fmt(line.luces.hora_fin_atencion, 2))

        # ── Estadísticas acumuladas ───────────────────────────────────────
        row.append(str(state.count_autos_atendidos))
        row.append(str(state.count_camionetas_atendidas))
        row.append(_fmt(row_context.get("tiempo_espera_auto"), 4))
        row.append(_fmt(state.total_espera_autos))
        row.append(_fmt(row_context.get("tiempo_espera_camioneta"), 4))
        row.append(_fmt(state.total_espera_camionetas))
        for line in state.lines:
            row.append(_fmt(row_context.get(f"tiempo_bloqueo_l{line.id}"), 4))
            row.append(_fmt(tracker.acum_bloqueo_frenos.get(line.id, 0.0)))

        # ── Clientes activos serializados ──────────────────────────────────────
        clientes_json_str = state.snapshot_active_vehicles_as_json()
        row.append(clientes_json_str)

        self._writer.writerow(row)
        # Acumular en memoria como dict para slicing O(1) en la API.
        # Se inyecta la lista de dicts directamente (no el JSON string)
        # para que los consumers de la API reciban JSON nativo.
        row_dict = dict(zip(self.headers, row))
        row_dict["Clientes_Activos"] = state.snapshot_active_vehicles()
        self.current_day_rows.append(row_dict)

    def close(self) -> None:
        """Cierra el archivo CSV."""
        if self._file:
            self._file.close()
            self._file = None
            self._writer = None
