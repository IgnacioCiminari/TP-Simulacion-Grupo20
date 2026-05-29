from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, NamedTuple

from core.event import Event
from core.fel import EventQueue
from core.rng import TrackedRandom
from core.state import SimulationState
from entities.line import InspectionLine
from entities.station import Station, StationType
from stats.exporter import MemoryExporter
from stats.tracker import StatsTracker, GlobalStatsAccumulator

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

    # Semilla de reproducibilidad (fija internamente, no expuesta al usuario)
    master_seed: int = 42

    # ── Condiciones de corte ────────────────────────────────────────────
    # La simulación se detiene cuando se cumple CUALQUIERA de las dos condiciones.
    max_dias: int = 10
    max_iteraciones: int = 1_000


class DayResult(NamedTuple):
    """Encapsula los resultados de un día de simulación."""
    dia: int
    tracker: StatsTracker
    rows: list[dict]   # vector de estado del día (lista de dicts ya construida)


# Claves del row_context para cada variable aleatoria muestreada
_CONTEXT_KEYS = [
    "rnd_llegada_auto",
    "tiempo_llegada_auto",
    "rnd_llegada_camioneta",
    "tiempo_llegada_camioneta",
    # Tiempo de espera del vehículo servido en este evento (por tipo)
    "tiempo_espera_auto",
    "tiempo_espera_camioneta",
    # Las claves por línea (rnd_frenos_lN, tiempo_bloqueo_lN, etc.)
    # se generan dinámicamente en reset_row_context() según config.num_lineas.
]


_CONTEXT_KEYS_PER_LINE = [
    "rnd_frenos_l{i}",
    "tiempo_frenos_l{i}",
    "rnd_luces_l{i}",
    "tiempo_luces_l{i}",
    "tiempo_bloqueo_l{i}",
]


class Simulation:
    """
    Motor de simulación por eventos discretos (DES) con soporte multi-día.

    Gestiona el reloj de simulación, la FEL y el bucle principal de despacho
    de eventos. Proporciona el generador de números aleatorios (RNG) a los
    eventos a través de métodos auxiliares que registran automáticamente el
    RND base y el valor generado en `row_context` para su exportación.

    La simulación se detiene cuando se cumple CUALQUIERA de las dos condiciones
    de corte: `max_dias` o `max_iteraciones`. Si se alcanza el límite de
    iteraciones en mitad de un día, ese día se completa antes de cortar.

    Todo el vector de estado se mantiene en memoria RAM (sin escritura a disco).
    El tiempo de ejecución real se mide con `time.perf_counter`.
    """

    def __init__(self, config: SimulationConfig) -> None:
        self.config = config
        self.exporter = MemoryExporter()

        # Contexto de la fila actual: RNDs y tiempos generados durante el evento.
        self.row_context: dict[str, float | None] = {}

        # Tiempo real de ejecución (segundos, llenado en run())
        self.elapsed_seconds: float = 0.0

    # ------------------------------------------------------------------
    # Derivación determinística de semillas
    # ------------------------------------------------------------------

    @staticmethod
    def _derive_seed(master_seed: int, dia: int) -> int:
        """
        Deriva una seed determinística para un día dado a partir de la
        semilla maestra. Para múltiples días, cada día tendrá una seed única
        pero reproducible dado el mismo master_seed.
        """
        combined = (master_seed * 6364136223846793005 + dia) & 0xFFFFFFFFFFFFFFFF
        return combined

    # ------------------------------------------------------------------
    # Gestión del contexto de fila (para la memoria)
    # ------------------------------------------------------------------

    def reset_row_context(self) -> None:
        """Limpia el contexto de la fila actual. Llamar antes de procesar cada evento.
        Genera las claves dinámicamente según el número de líneas configurado."""
        ctx = {key: None for key in _CONTEXT_KEYS}
        for i in range(1, self.config.num_lineas + 1):
            for key_template in _CONTEXT_KEYS_PER_LINE:
                ctx[key_template.replace("{i}", str(i))] = None
        self.row_context = ctx

    # ------------------------------------------------------------------
    # Generadores de variables aleatorias
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

    def _run_single_day(
        self, dia: int,
        offset_autos: int = 0,
        offset_camionetas: int = 0,
    ) -> tuple[StatsTracker, list[dict], int]:
        """
        Inicializa y ejecuta un único día de simulación.

        Args:
            dia: Número de jornada (1-indexed).
            offset_autos: Total global de autos atendidos en días anteriores.
            offset_camionetas: Total global de camionetas atendidas en días anteriores.

        Returns:
            (tracker, rows, iteraciones) donde `iteraciones` es la cantidad de
            filas escritas en el vector de estado durante ese día.
        """
        from events.llegada_auto import LlegadaAuto
        from events.llegada_camioneta import LlegadaCamioneta
        from events.cierre_puertas import CierrePuertas

        # ── Inicializar estado fresco para el día ──────────────────────────
        seed = self._derive_seed(self.config.master_seed, dia)
        self.rng = TrackedRandom(seed)

        lines = [
            InspectionLine(
                id=i + 1,
                frenos=Station(StationType.FRENOS, line_id=i + 1),
                luces=Station(StationType.LUCES, line_id=i + 1),
            )
            for i in range(self.config.num_lineas)
        ]
        self.state = SimulationState(lines=lines)
        self.state.clock = self.config.hora_apertura

        self.fel = EventQueue()
        self.tracker = StatsTracker(config=self.config)

        # ── Agendar eventos iniciales ──────────────────────────────────────
        self.reset_row_context()
        t0 = self.config.hora_apertura

        t_auto = self.sample_llegada_auto()
        self.state.prox_llegada_auto = t0 + t_auto
        self.schedule(LlegadaAuto(timestamp=self.state.prox_llegada_auto))

        t_cam = self.sample_llegada_camioneta()
        self.state.prox_llegada_camioneta = t0 + t_cam
        self.schedule(LlegadaCamioneta(timestamp=self.state.prox_llegada_camioneta))

        self.schedule(CierrePuertas(timestamp=self.config.hora_cierre_puertas))

        # ── Preparar exporter para este día ───────────────────────────────
        self.exporter.start_day(dia, offset_autos=offset_autos, offset_camionetas=offset_camionetas)

        self.exporter.write_row(
            "Inicialización", self.state, self.tracker, self.config, self.fel,
            self.row_context, dia,
        )

        # ── Bucle del día ──────────────────────────────────────────────────
        while self.fel:
            event = self.fel.pop()
            self.state.clock = event.timestamp
            self.reset_row_context()
            new_events = event.process(self)
            for new_event in new_events:
                self.schedule(new_event)
            self.exporter.write_row(
                event.nombre, self.state, self.tracker, self.config, self.fel,
                self.row_context, dia,
            )

        # ── Registrar fin de jornada ───────────────────────────────────────
        self.state.fin_jornada = self.state.clock
        self.tracker.fin_jornada = self.state.clock

        # Persistir valores que dependen del state antes de descartarlo
        self.tracker.cache_final_stats(self.state)

        rows = list(self.exporter.current_day_rows)
        iteraciones = len(rows)
        return self.tracker, rows, iteraciones

    def run(self) -> tuple[list[DayResult], GlobalStatsAccumulator]:
        """
        Ejecuta la simulación completa (múltiples días) respetando las condiciones
        de corte configuradas.

        Returns:
            Tupla (results, global_stats):
              - results: Lista de DayResult, uno por día simulado.
              - global_stats: Acumulador con estadísticas de toda la simulación.
        """
        # Inicializar el exporter en memoria (sin apertura de archivos)
        self.exporter.init_header(self.config)

        results: list[DayResult] = []
        global_stats = GlobalStatsAccumulator()
        total_iteraciones = 0
        dia = 1

        # Offsets globales que se pasan a cada día para calcular Acum_Global_*
        offset_autos = 0
        offset_camionetas = 0

        t_start = time.perf_counter()

        while True:
            tracker, rows, iteraciones_dia = self._run_single_day(
                dia,
                offset_autos=offset_autos,
                offset_camionetas=offset_camionetas,
            )
            total_iteraciones += iteraciones_dia
            results.append(DayResult(dia=dia, tracker=tracker, rows=rows))
            global_stats.add_day(tracker)

            # Actualizar offsets para el siguiente día
            offset_autos += tracker.autos_atendidos
            offset_camionetas += tracker.camionetas_atendidas

            # Evaluar condiciones de corte (se corta si se cumple CUALQUIERA)
            limite_dias = dia >= self.config.max_dias
            limite_iter = total_iteraciones >= self.config.max_iteraciones

            if limite_dias or limite_iter:
                break

            dia += 1

        self.elapsed_seconds = time.perf_counter() - t_start
        return results, global_stats
