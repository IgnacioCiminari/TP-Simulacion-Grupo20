from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.simulation import SimulationConfig


class StatsTracker:
    """
    Centraliza y calcula las métricas de salida de un único día de simulación.

    Acumula:
      - Tiempos de bloqueo por estación de Frenos (indexados por line_id).
      - Tiempos de atención (servicio activo) por estación de Frenos y Luces,
        indexados por line_id. Útil para el gráfico de "Top días más productivos".
      - Longitud máxima de la cola durante el día.
    Al finalizar el día, se llama a `cache_final_stats()` para persistir los
    valores que dependen del estado mutable (SimulationState), antes de que
    ese estado sea descartado al comenzar el siguiente día.

    Nota: los tiempos de espera en cola son EXCLUSIVAMENTE globales (acumulados
    en GlobalStatsAccumulator a través de `contribute_to_global()`). Sin embargo,
    los promedios por día se cachean igualmente para los gráficos de scatter.
    """

    def __init__(self, config: "SimulationConfig") -> None:
        self.config = config

        # Bloqueos por línea: {line_id: tiempo_total_bloqueado (día)}
        self.acum_bloqueo_frenos: dict[int, float] = {}

        # Tiempos de atención (servicio real) por línea
        # {line_id: tiempo_total_en_servicio}
        self.acum_servicio_frenos: dict[int, float] = {}
        self.acum_servicio_luces: dict[int, float] = {}

        # Hora de finalización de la jornada
        self.fin_jornada: float | None = None

        # Valores cacheados al cierre del día (llenados por cache_final_stats)
        self.autos_atendidos: int = 0
        self.camionetas_atendidas: int = 0
        self.max_cola: int = 0          # longitud máxima de cola del día

        # Acumuladores de espera del día para contribuir a las stats globales
        # y para los gráficos de scatter (espera vs bloqueo por día)
        self._total_espera_autos: float = 0.0
        self._total_espera_camionetas: float = 0.0

    # ------------------------------------------------------------------
    # Registro de tiempos de atención
    # ------------------------------------------------------------------

    def register_servicio_frenos(self, line_id: int, tiempo: float) -> None:
        """Acumula el tiempo de atención real en la estación de Frenos de la línea dada."""
        self.acum_servicio_frenos[line_id] = (
            self.acum_servicio_frenos.get(line_id, 0.0) + tiempo
        )

    def register_servicio_luces(self, line_id: int, tiempo: float) -> None:
        """Acumula el tiempo de atención real en la estación de Luces de la línea dada."""
        self.acum_servicio_luces[line_id] = (
            self.acum_servicio_luces.get(line_id, 0.0) + tiempo
        )

    # ------------------------------------------------------------------
    # Cálculo de métricas de jornada
    # ------------------------------------------------------------------

    def porcentaje_bloqueo_frenos(self, line_id: int) -> float:
        """
        Porcentaje de tiempo de la jornada en que la estación de Frenos de la
        línea indicada estuvo bloqueada (respecto a la duración total de la jornada).
        """
        duracion = self._duracion_jornada()
        if duracion <= 0:
            return 0.0
        bloqueado = self.acum_bloqueo_frenos.get(line_id, 0.0)
        return (bloqueado / duracion) * 100.0

    def total_servicio_linea(self, line_id: int) -> float:
        """Tiempo total de atención (frenos + luces) de una línea en el día."""
        return (
            self.acum_servicio_frenos.get(line_id, 0.0)
            + self.acum_servicio_luces.get(line_id, 0.0)
        )

    def promedio_espera_autos(self) -> float:
        if self.autos_atendidos == 0:
            return 0.0
        return self._total_espera_autos / self.autos_atendidos

    def promedio_espera_camionetas(self) -> float:
        if self.camionetas_atendidas == 0:
            return 0.0
        return self._total_espera_camionetas / self.camionetas_atendidas

    def _duracion_jornada(self) -> float:
        if self.fin_jornada is None:
            return 0.0
        return self.fin_jornada - self.config.hora_apertura

    def hora_fin_jornada_hhmm(self) -> str:
        """Convierte el minuto de fin de jornada a formato HH:MM."""
        if self.fin_jornada is None:
            return "N/A"
        total_minutos = int(self.fin_jornada)
        horas = total_minutos // 60
        minutos = total_minutos % 60
        return f"{horas:02d}:{minutos:02d}"

    def cache_final_stats(self, state) -> None:
        """
        Persiste en el tracker los valores que dependen del state mutable,
        antes de que el estado sea reiniciado para el siguiente día.
        Debe llamarse al cierre de cada jornada.
        """
        self.autos_atendidos = state.count_autos_atendidos
        self.camionetas_atendidas = state.count_camionetas_atendidas
        self._total_espera_autos = state.total_espera_autos
        self._total_espera_camionetas = state.total_espera_camionetas

    def update_max_cola(self, state) -> None:
        """Actualiza la longitud máxima de la cola de entrada registrada durante el día."""
        cola_actual = state.entry_queue.count_autos() + state.entry_queue.count_camionetas()
        if cola_actual > self.max_cola:
            self.max_cola = cola_actual

    def report_cached(self) -> str:
        """
        Genera un reporte de texto usando los valores cacheados por cache_final_stats().
        No requiere acceso al state — útil después de que el día fue completado.
        """
        lines = [
            f"  Hora de fin de jornada: {self.hora_fin_jornada_hhmm()} ({self.fin_jornada:.2f} min)",
            f"  Autos atendidos:        {self.autos_atendidos}",
            f"  Camionetas atendidas:   {self.camionetas_atendidas}",
            f"  Max cola del día:       {self.max_cola}",
        ]
        for line_id in sorted(self.acum_bloqueo_frenos.keys()):
            pct = self.porcentaje_bloqueo_frenos(line_id)
            lines.append(
                f"  Bloqueo Frenos Línea {line_id}: {pct:.2f}%"
            )
        return "\n".join(lines)


class GlobalStatsAccumulator:
    """
    Acumula las estadísticas de todos los días de una simulación multi-día.

    Debe actualizarse al cierre de cada DayResult llamando a `add_day()`.
    Una vez completada la simulación, provee las métricas globales finales.
    """

    def __init__(self) -> None:
        # Tiempos de espera globales
        self._total_espera_autos: float = 0.0
        self._total_espera_camionetas: float = 0.0
        self._count_autos: int = 0
        self._count_camionetas: int = 0

        # Vehículos totales atendidos en toda la simulación
        self.total_autos_atendidos: int = 0
        self.total_camionetas_atendidas: int = 0

        # Bloqueo global por línea: {line_id: (acum_bloqueado, acum_duracion)}
        self._bloqueo_frenos: dict[int, tuple[float, float]] = {}

        # Servicio global por línea: {line_id: (acum_frenos, acum_luces)}
        self._servicio_linea: dict[int, tuple[float, float]] = {}

        # Horas de fin de jornada (para calcular promedio)
        self._fins_jornada: list[float] = []

    def add_day(self, tracker: "StatsTracker") -> None:
        """Incorpora las estadísticas de un día al acumulador global."""
        self._total_espera_autos += tracker._total_espera_autos
        self._total_espera_camionetas += tracker._total_espera_camionetas
        self._count_autos += tracker.autos_atendidos
        self._count_camionetas += tracker.camionetas_atendidas
        self.total_autos_atendidos += tracker.autos_atendidos
        self.total_camionetas_atendidas += tracker.camionetas_atendidas

        if tracker.fin_jornada is not None:
            self._fins_jornada.append(tracker.fin_jornada)

        duracion = tracker._duracion_jornada()
        for line_id, bloqueado in tracker.acum_bloqueo_frenos.items():
            prev_bloq, prev_dur = self._bloqueo_frenos.get(line_id, (0.0, 0.0))
            self._bloqueo_frenos[line_id] = (prev_bloq + bloqueado, prev_dur + duracion)

        # Acumular tiempos de servicio globales
        all_line_ids = set(tracker.acum_servicio_frenos) | set(tracker.acum_servicio_luces)
        for line_id in all_line_ids:
            f = tracker.acum_servicio_frenos.get(line_id, 0.0)
            l = tracker.acum_servicio_luces.get(line_id, 0.0)
            prev_f, prev_l = self._servicio_linea.get(line_id, (0.0, 0.0))
            self._servicio_linea[line_id] = (prev_f + f, prev_l + l)

    # ------------------------------------------------------------------
    # Métricas derivadas
    # ------------------------------------------------------------------

    @property
    def promedio_espera_autos(self) -> float:
        """Tiempo promedio de espera en cola de autos a lo largo de toda la simulación."""
        if self._count_autos == 0:
            return 0.0
        return self._total_espera_autos / self._count_autos

    @property
    def promedio_espera_camionetas(self) -> float:
        """Tiempo promedio de espera en cola de camionetas a lo largo de toda la simulación."""
        if self._count_camionetas == 0:
            return 0.0
        return self._total_espera_camionetas / self._count_camionetas

    @property
    def promedio_fin_jornada(self) -> float | None:
        """Minuto promedio de fin de jornada a lo largo de todos los días."""
        if not self._fins_jornada:
            return None
        return sum(self._fins_jornada) / len(self._fins_jornada)

    def promedio_fin_jornada_hhmm(self) -> str:
        """Promedio de fin de jornada en formato HH:MM."""
        avg = self.promedio_fin_jornada
        if avg is None:
            return "N/A"
        total_minutos = int(avg)
        horas = total_minutos // 60
        minutos = total_minutos % 60
        return f"{horas:02d}:{minutos:02d}"

    def porcentaje_bloqueo_global(self, line_id: int) -> float:
        """Porcentaje global de bloqueo de frenos para una línea determinada."""
        if line_id not in self._bloqueo_frenos:
            return 0.0
        bloqueado, duracion = self._bloqueo_frenos[line_id]
        if duracion <= 0:
            return 0.0
        return (bloqueado / duracion) * 100.0

    def all_line_ids(self) -> list[int]:
        """Lista de IDs de líneas que tuvieron bloqueo o servicio registrado."""
        ids = set(self._bloqueo_frenos.keys()) | set(self._servicio_linea.keys())
        return sorted(ids)

    def porcentaje_bloqueo_global_dict(self) -> dict[str, float]:
        """Diccionario {str(line_id): porcentaje} de bloqueo global por línea."""
        return {
            str(lid): round(self.porcentaje_bloqueo_global(lid), 4)
            for lid in self.all_line_ids()
        }
