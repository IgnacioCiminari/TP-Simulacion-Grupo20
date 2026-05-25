from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.simulation import SimulationConfig


class StatsTracker:
    """
    Centraliza y calcula las métricas de salida de la simulación.

    Acumula tiempos de espera por tipo de vehículo y tiempos de bloqueo por
    estación de Frenos (indexados por line_id). Al finalizar la simulación,
    computa los promedios y porcentajes.
    """

    def __init__(self, config: "SimulationConfig") -> None:
        self.config = config

        # Bloqueos por línea: {line_id: tiempo_total_bloqueado}
        self.acum_bloqueo_frenos: dict[int, float] = {}

        # Hora de finalización de la jornada
        self.fin_jornada: float | None = None

    # ------------------------------------------------------------------
    # Cálculo de métricas finales
    # ------------------------------------------------------------------

    def promedio_espera_autos(self, state) -> float:
        """Tiempo promedio de espera en cola de los autos."""
        if state.count_autos_atendidos == 0:
            return 0.0
        return state.total_espera_autos / state.count_autos_atendidos

    def promedio_espera_camionetas(self, state) -> float:
        """Tiempo promedio de espera en cola de las camionetas."""
        if state.count_camionetas_atendidas == 0:
            return 0.0
        return state.total_espera_camionetas / state.count_camionetas_atendidas

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

    def report(self, state) -> str:
        """Genera un reporte de texto de los resultados finales."""
        lines = [
            "=" * 60,
            "  RESULTADOS DE LA SIMULACIÓN - RTV",
            "=" * 60,
            f"  Hora de fin de jornada:           {self.hora_fin_jornada_hhmm()} ({self.fin_jornada:.2f} min)",
            f"  Tiempo promedio espera autos:      {self.promedio_espera_autos(state):.4f} min",
            f"  Tiempo promedio espera camionetas: {self.promedio_espera_camionetas(state):.4f} min",
            f"  Autos atendidos:                  {state.count_autos_atendidos}",
            f"  Camionetas atendidas:              {state.count_camionetas_atendidas}",
        ]
        for line_id in sorted(self.acum_bloqueo_frenos.keys()):
            pct = self.porcentaje_bloqueo_frenos(line_id)
            lines.append(
                f"  Bloqueo Frenos Línea {line_id}:            {pct:.2f}%"
            )
        lines.append("=" * 60)
        return "\n".join(lines)
