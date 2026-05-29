from __future__ import annotations

import io
import csv
import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.simulation import SimulationConfig
    from core.state import SimulationState
    from core.fel import EventQueue
    from stats.tracker import StatsTracker


# ---------------------------------------------------------------------------
# Encabezado del CSV
# Orden: Iteracion | Dia | Evento | Reloj | [Llegadas: RND, Tiempo, Hora] |
#        [Colas] | [Por línea: Frenos(RND, Tiempo, Estado, Vehículo, FinAtencion),
#                              Luces(RND, Tiempo, Estado, Vehículo, FinAtencion)] |
#        [Estadísticas: atendidos del día, acum global, espera, bloqueo] |
#        [Clientes activos como JSON completo]
# ---------------------------------------------------------------------------

_HEADER_FIXED = [
    "Iteracion",
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
    # Contadores del día (se reinician por día)
    "Cant_Autos_Atendidos",
    "Cant_Camionetas_Atendidas",
    # Acumuladores globales (nunca se reinician)
    "Acum_Global_Autos",
    "Acum_Global_Camionetas",
    # Tiempos de espera del evento actual y acumulado del día
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


def _build_header(num_lineas: int) -> list[str]:
    """Construye la lista completa de encabezados para N líneas."""
    header = list(_HEADER_FIXED)
    for i in range(1, num_lineas + 1):
        for col in _HEADER_PER_LINE:
            header.append(col.replace("{i}", str(i)))
    header.extend(_HEADER_STATS)
    for i in range(1, num_lineas + 1):
        header.append(f"Tiempo_Bloqueo_L{i}")
        header.append(f"Acum_Bloqueo_Frenos_L{i}")
    header.extend(_HEADER_CLIENTES)
    return header


class MemoryExporter:
    """
    Mantiene el vector de estado de la simulación multi-día exclusivamente en
    memoria RAM. No escribe ningún archivo a disco.

    Ventajas:
      - Sin penalización de I/O durante la simulación (rendimiento óptimo).
      - El CSV se puede generar al vuelo bajo demanda (endpoint de exportación).

    Para cada fila se incluye:
      - `Iteracion`: ID global incremental de fila a lo largo de toda la simulación.
      - `Acum_Global_Autos` / `Acum_Global_Camionetas`: totales que NUNCA se reinician
        entre días (a diferencia de Cant_Autos_Atendidos que sí se reinicia).
      - `Clientes_Activos`: serializado como JSON completo en el CSV.
    """

    def __init__(self) -> None:
        self._num_lineas: int = 2
        self.headers: list[str] = []

        # Vector de estado en memoria: todos los días indexados
        # {dia: list[dict]}
        self.rows_by_day: dict[int, list[dict]] = {}

        # Filas del día actual (se reinicia en start_day)
        self.current_day_rows: list[dict] = []

        # Contador global de iteración (ID de fila incrementa a lo largo de todos los días)
        self._iteracion: int = 0

        # Acumuladores globales que NO se reinician entre días
        self._global_autos: int = 0
        self._global_camionetas: int = 0

        # Offset al inicio de cada día (valores acumulados hasta el fin del día anterior)
        self._offset_autos: int = 0
        self._offset_camionetas: int = 0

        # Último row generado (para sticky row en el front)
        self.last_row: dict | None = None

    def init_header(self, config: "SimulationConfig") -> None:
        """Inicializa los encabezados y reinicia el índice de datos."""
        self._num_lineas = config.num_lineas
        self.headers = _build_header(self._num_lineas)
        self.rows_by_day = {}
        self._iteracion = 0
        self._global_autos = 0
        self._global_camionetas = 0
        self._offset_autos = 0
        self._offset_camionetas = 0
        self.last_row = None

    def start_day(self, dia: int, offset_autos: int = 0, offset_camionetas: int = 0) -> None:
        """
        Prepara el exporter para recibir las filas del día indicado.
        Los offsets representan los totales globales acumulados hasta el fin del día anterior.
        """
        self.current_day_rows = []
        self.rows_by_day[dia] = self.current_day_rows
        self._offset_autos = offset_autos
        self._offset_camionetas = offset_camionetas

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
        """Serializa el vector de estado actual y lo guarda en memoria."""
        self._iteracion += 1
        row: list[str] = []

        # ── Iteración (ID global) ─────────────────────────────────────────
        row.append(str(self._iteracion))

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

        # ── Estadísticas acumuladas del día ───────────────────────────────
        row.append(str(state.count_autos_atendidos))
        row.append(str(state.count_camionetas_atendidas))

        # ── Acumuladores globales (offset del día anterior + lo de este día) ──
        acum_global_autos = self._offset_autos + state.count_autos_atendidos
        acum_global_camionetas = self._offset_camionetas + state.count_camionetas_atendidas
        row.append(str(acum_global_autos))
        row.append(str(acum_global_camionetas))

        row.append(_fmt(row_context.get("tiempo_espera_auto"), 4))
        row.append(_fmt(state.total_espera_autos))
        row.append(_fmt(row_context.get("tiempo_espera_camioneta"), 4))
        row.append(_fmt(state.total_espera_camionetas))
        for line in state.lines:
            row.append(_fmt(row_context.get(f"tiempo_bloqueo_l{line.id}"), 4))
            row.append(_fmt(tracker.acum_bloqueo_frenos.get(line.id, 0.0)))

        # ── Clientes activos ──────────────────────────────────────────────
        clientes_snapshot = state.snapshot_active_vehicles()
        # En CSV: string placeholder (se serializa como JSON en generate_csv_bytes)
        row.append(str(len(clientes_snapshot)))

        # Construir dict para API (Clientes_Activos como lista nativa)
        row_dict = dict(zip(self.headers, row))
        row_dict["Clientes_Activos"] = clientes_snapshot
        row_dict["Acum_Global_Autos"] = str(acum_global_autos)
        row_dict["Acum_Global_Camionetas"] = str(acum_global_camionetas)

        # Actualizar el tracker con la longitud de cola actual
        tracker.update_max_cola(state)

        self.current_day_rows.append(row_dict)
        self.last_row = row_dict

    def generate_csv_bytes(self) -> bytes:
        """
        Genera el contenido del CSV completo en memoria y devuelve los bytes.
        Se invoca al descargar el CSV desde el endpoint de exportación.
        Clientes_Activos se serializa como JSON completo.
        """
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(self.headers)

        for dia in sorted(self.rows_by_day.keys()):
            for row_dict in self.rows_by_day[dia]:
                clientes = row_dict.get("Clientes_Activos", [])
                if isinstance(clientes, list):
                    # JSON completo con todos los datos de cada cliente
                    clientes_str = json.dumps(clientes, ensure_ascii=False) if clientes else ""
                else:
                    clientes_str = str(clientes)

                row_values = []
                for h in self.headers:
                    if h == "Clientes_Activos":
                        row_values.append(clientes_str)
                    else:
                        row_values.append(row_dict.get(h, ""))
                writer.writerow(row_values)

        return buffer.getvalue().encode("utf-8-sig")  # BOM para Excel
