from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from core.event import Event
from core.fel import EventQueue
from core.rng import TrackedRandom
from core.state import SimulationState
from entities.line import InspectionLine
from entities.station import Station, StationType
from stats.exporter import CsvExporter
from stats.tracker import StatsTracker

if TYPE_CHECKING:
    pass


@dataclass
class SimulationConfig:
    """
    Parámetros configurables de la simulación. Centraliza todos los valores
    numéricos para evitar números mágicos en la lógica de eventos.
    """

    # Horario de la jornada (en minutos desde la medianoche)
    hora_apertura: float = 480.0    # 08:00 hs
    hora_cierre_puertas: float = 960.0  # 16:00 hs

    # Tiempos medios de llegada (distribución exponencial, en minutos)
    media_llegada_auto: float = 15.0
    media_llegada_camioneta: float = 30.0

    # Tiempos de revisión (distribución uniforme, en minutos)
    frenos_min: float = 4.0
    frenos_max: float = 7.0
    luces_min: float = 6.0
    luces_max: float = 10.0

    # Infraestructura
    num_lineas: int = 2

    # Salida
    csv_output_path: str = "output/vector_de_estado.csv"

    # Semilla de reproducibilidad
    # Usar None para generación aleatoria real
    master_seed: int | None = 42

    # Índice de corrida (día) — usado para derivar seed determinístico por día
    run_index: int = 1


# Claves del row_context para cada variable aleatoria muestreada
# Formato: {"rnd_<var>": float | None, "tiempo_<var>": float | None}
_CONTEXT_KEYS = [
    "rnd_llegada_auto",
    "tiempo_llegada_auto",
    "rnd_llegada_camioneta",
    "tiempo_llegada_camioneta",
    "rnd_frenos_l1",
    "tiempo_frenos_l1",
    "rnd_luces_l1",
    "tiempo_luces_l1",
    "rnd_frenos_l2",
    "tiempo_frenos_l2",
    "rnd_luces_l2",
    "tiempo_luces_l2",
]


class Simulation:
    """
    Motor de simulación por eventos discretos (DES).

    Gestiona el reloj de simulación, la FEL y el bucle principal de despacho
    de eventos. Proporciona el generador de números aleatorios (RNG) a los
    eventos a través de métodos auxiliares que registran automáticamente el
    RND base y el valor generado en `row_context` para su exportación al CSV.
    """

    def __init__(self, config: SimulationConfig) -> None:
        self.config = config

        # Derivar seed determinística para este día de simulación
        seed = self._derive_seed(config.master_seed, config.run_index)
        self.rng = TrackedRandom(seed)

        # Construir la infraestructura de la planta
        lines = [
            InspectionLine(
                id=i + 1,
                frenos=Station(StationType.FRENOS, line_id=i + 1),
                luces=Station(StationType.LUCES, line_id=i + 1),
            )
            for i in range(config.num_lineas)
        ]

        self.state = SimulationState(lines=lines)
        self.state.clock = config.hora_apertura

        self.fel = EventQueue()
        self.tracker = StatsTracker(config=config)
        self.exporter = CsvExporter(config.csv_output_path)

        # Contexto de la fila actual: RNDs y tiempos generados durante el evento
        self.row_context: dict[str, float | None] = {}
        self.reset_row_context()

    # ------------------------------------------------------------------
    # Derivación determinística de semillas
    # ------------------------------------------------------------------

    @staticmethod
    def _derive_seed(master_seed: int | None, run_index: int) -> int | None:
        """
        Deriva una seed determinística para una corrida dada a partir de la
        semilla maestra. Para múltiples días, cada día tendrá una seed única
        pero reproducible dado el mismo master_seed.

        Si master_seed es None, se devuelve None (comportamiento aleatorio real).
        """
        if master_seed is None:
            return None
        combined = (master_seed * 6364136223846793005 + run_index) & 0xFFFFFFFFFFFFFFFF
        return combined

    # ------------------------------------------------------------------
    # Gestión del contexto de fila (para el CSV)
    # ------------------------------------------------------------------

    def reset_row_context(self) -> None:
        """Limpia el contexto de la fila actual. Llamar antes de procesar cada evento."""
        self.row_context = {key: None for key in _CONTEXT_KEYS}

    # ------------------------------------------------------------------
    # Generadores de variables aleatorias
    # Los métodos registran automáticamente (rnd, tiempo) en row_context.
    # Devuelven únicamente el valor muestreado para no cambiar las firmas
    # de los eventos.
    # ------------------------------------------------------------------

    def sample_llegada_auto(self) -> float:
        """Tiempo entre llegadas de autos (exponencial). Registra RND en contexto."""
        rnd, value = self.rng.exponential(self.config.media_llegada_auto)
        self.row_context["rnd_llegada_auto"] = rnd
        self.row_context["tiempo_llegada_auto"] = value
        return value

    def sample_llegada_camioneta(self) -> float:
        """Tiempo entre llegadas de camionetas (exponencial). Registra RND en contexto."""
        rnd, value = self.rng.exponential(self.config.media_llegada_camioneta)
        self.row_context["rnd_llegada_camioneta"] = rnd
        self.row_context["tiempo_llegada_camioneta"] = value
        return value

    def sample_tiempo_frenos(self, line_id: int) -> float:
        """
        Tiempo de revisión de frenos (uniforme). Registra RND en contexto
        para la línea correspondiente.
        """
        rnd, value = self.rng.uniform(self.config.frenos_min, self.config.frenos_max)
        self.row_context[f"rnd_frenos_l{line_id}"] = rnd
        self.row_context[f"tiempo_frenos_l{line_id}"] = value
        return value

    def sample_tiempo_luces(self, line_id: int) -> float:
        """
        Tiempo de revisión de luces y emisiones (uniforme). Registra RND en contexto
        para la línea correspondiente.
        """
        rnd, value = self.rng.uniform(self.config.luces_min, self.config.luces_max)
        self.row_context[f"rnd_luces_l{line_id}"] = rnd
        self.row_context[f"tiempo_luces_l{line_id}"] = value
        return value

    # ------------------------------------------------------------------
    # Bucle principal
    # ------------------------------------------------------------------

    def schedule(self, event: Event) -> None:
        """Agenda un evento en la FEL."""
        self.fel.push(event)

    def run(self) -> StatsTracker:
        """
        Ejecuta el bucle principal de la simulación hasta que la FEL quede vacía.

        Returns:
            El tracker con las estadísticas finales de la corrida.
        """
        from events.llegada_auto import LlegadaAuto
        from events.llegada_camioneta import LlegadaCamioneta
        from events.cierre_puertas import CierrePuertas

        # Agendar eventos iniciales (con contexto limpio para la fila de Inicialización).
        # Se extrae cada tiempo muestreado en una variable para poder setear
        # state.prox_llegada_* ANTES de escribir la fila de Inicialización;
        # de lo contrario el exportador los leería como None (error de arrastre).
        self.reset_row_context()
        t0 = self.config.hora_apertura

        t_auto = self.sample_llegada_auto()
        self.state.prox_llegada_auto = t0 + t_auto
        self.schedule(LlegadaAuto(timestamp=self.state.prox_llegada_auto))

        t_cam = self.sample_llegada_camioneta()
        self.state.prox_llegada_camioneta = t0 + t_cam
        self.schedule(LlegadaCamioneta(timestamp=self.state.prox_llegada_camioneta))

        self.schedule(CierrePuertas(timestamp=self.config.hora_cierre_puertas))

        # Inicializar el CSV
        self.exporter.write_header(self.state, self.config)
        self.exporter.write_row(
            "Inicialización", self.state, self.tracker, self.config, self.fel,
            self.row_context,
        )

        # Bucle principal
        while self.fel:
            event = self.fel.pop()
            self.state.clock = event.timestamp

            # Limpiar el contexto antes de procesar el evento
            self.reset_row_context()

            new_events = event.process(self)

            for new_event in new_events:
                self.schedule(new_event)

            # Registrar vector de estado (con los RNDs capturados durante el evento)
            self.exporter.write_row(
                event.nombre, self.state, self.tracker, self.config, self.fel,
                self.row_context,
            )

        # Registrar hora fin de jornada
        self.state.fin_jornada = self.state.clock
        self.tracker.fin_jornada = self.state.clock

        self.exporter.close()
        return self.tracker
