from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, NamedTuple

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

    # ── Condiciones de corte ────────────────────────────────────────────────
    # La simulación se detiene cuando se cumple CUALQUIERA de las dos condiciones.
    # max_dias:       detiene después de completar exactamente ese número de días.
    # max_iteraciones: detiene después de que el total de iteraciones (filas del
    #                  vector de estado) supere este umbral; siempre se completa
    #                  el día en curso antes de cortar.
    max_dias: int = 10
    max_iteraciones: int = 1_000


class DayResult(NamedTuple):
    """Encapsula los resultados de un día de simulación."""
    dia: int
    tracker: StatsTracker
    rows: list[dict]   # vector de estado del día (lista de dicts ya construida)


# Claves del row_context para cada variable aleatoria muestreada
# Formato: {"rnd_<var>": float | None, "tiempo_<var>": float | None}
# También incluye claves para tiempos de espera y bloqueo del evento actual.
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
    # Tiempo de espera del vehículo servido en este evento (por tipo)
    "tiempo_espera_auto",
    "tiempo_espera_camioneta",
    # Tiempo de bloqueo liberado en este evento (por línea)
    "tiempo_bloqueo_l1",
    "tiempo_bloqueo_l2",
]


class Simulation:
    """
    Motor de simulación por eventos discretos (DES) con soporte multi-día.

    Gestiona el reloj de simulación, la FEL y el bucle principal de despacho
    de eventos. Proporciona el generador de números aleatorios (RNG) a los
    eventos a través de métodos auxiliares que registran automáticamente el
    RND base y el valor generado en `row_context` para su exportación al CSV.

    La simulación se detiene cuando se cumple CUALQUIERA de las dos condiciones
    de corte: `max_dias` o `max_iteraciones`. Si se alcanza el límite de
    iteraciones en mitad de un día, ese día se completa antes de cortar.
    """

    def __init__(self, config: SimulationConfig) -> None:
        self.config = config
        self.exporter = CsvExporter(config.csv_output_path)

        # Contexto de la fila actual: RNDs y tiempos generados durante el evento.
        # Se comparte entre días; se reinicia antes de cada evento.
        self.row_context: dict[str, float | None] = {}

    # ------------------------------------------------------------------
    # Derivación determinística de semillas
    # ------------------------------------------------------------------

    @staticmethod
    def _derive_seed(master_seed: int | None, dia: int) -> int | None:
        """
        Deriva una seed determinística para un día dado a partir de la
        semilla maestra. Para múltiples días, cada día tendrá una seed única
        pero reproducible dado el mismo master_seed.

        Si master_seed es None, se devuelve None (comportamiento aleatorio real).
        """
        if master_seed is None:
            return None
        combined = (master_seed * 6364136223846793005 + dia) & 0xFFFFFFFFFFFFFFFF
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

    def _run_single_day(self, dia: int) -> tuple[StatsTracker, list[dict], int]:
        """
        Inicializa y ejecuta un único día de simulación.

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

        # ── Escribir encabezado (sólo en el primer día) e inicialización ──
        if dia == 1:
            self.exporter.write_header(self.state, self.config)
        self.exporter.start_day(dia)

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

        # Persistir promedios antes de que el state sea reiniciado para el
        # próximo día (o descartado al finalizar la simulación).
        self.tracker.cache_final_stats(self.state)

        rows = list(self.exporter.current_day_rows)
        iteraciones = len(rows)
        return self.tracker, rows, iteraciones

    def run(self) -> list[DayResult]:
        """
        Ejecuta la simulación completa (múltiples días) respetando las condiciones
        de corte configuradas.

        La simulación avanza día a día y se detiene cuando se cumple CUALQUIERA
        de las siguientes condiciones:
          - Se completaron `max_dias` días.
          - El total acumulado de iteraciones supera `max_iteraciones` (siempre
            se completa el día en curso antes de cortar).

        Returns:
            Lista de DayResult, uno por cada día simulado, con su tracker y
            su vector de estado independiente.
        """
        results: list[DayResult] = []
        total_iteraciones = 0
        dia = 1

        while True:
            tracker, rows, iteraciones_dia = self._run_single_day(dia)
            total_iteraciones += iteraciones_dia
            results.append(DayResult(dia=dia, tracker=tracker, rows=rows))

            # Evaluar condiciones de corte (se corta si se cumple CUALQUIERA)
            limite_dias = dia >= self.config.max_dias
            limite_iter = total_iteraciones >= self.config.max_iteraciones

            if limite_dias or limite_iter:
                break

            dia += 1

        self.exporter.close()
        return results
