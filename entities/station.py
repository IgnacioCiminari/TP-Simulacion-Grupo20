from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from entities.vehicle import Vehicle


class StationType(Enum):
    FRENOS = "Frenos"
    LUCES = "Luces"


class StationStatus(Enum):
    LIBRE = "Libre"
    OCUPADO = "Ocupado"
    BLOQUEADO = "Bloqueado"


class Station:
    """
    Representa una estación de servicio dentro de una línea de inspección.

    Puede ser de tipo Frenos o Luces y mantiene su estado, el vehículo actual
    y acumuladores para calcular estadísticas de uso y bloqueo.
    """

    def __init__(self, tipo: StationType, line_id: int) -> None:
        self.tipo = tipo
        self.line_id = line_id
        self.status: StationStatus = StationStatus.LIBRE
        self.current_vehicle: Vehicle | None = None
        self.hora_fin_atencion: float | None = None

        # Acumuladores para estadísticas
        self._total_busy_time: float = 0.0
        self._total_blocked_time: float = 0.0
        self._block_start: float | None = None
        self._busy_start: float | None = None

    # ------------------------------------------------------------------
    # Consultas de estado
    # ------------------------------------------------------------------

    def is_free(self) -> bool:
        return self.status == StationStatus.LIBRE

    def is_busy(self) -> bool:
        return self.status == StationStatus.OCUPADO

    def is_blocked(self) -> bool:
        return self.status == StationStatus.BLOQUEADO

    # ------------------------------------------------------------------
    # Transiciones de estado
    # ------------------------------------------------------------------

    def start_service(self, vehicle: "Vehicle", clock: float, fin: float) -> None:
        """Inicia la atención de un vehículo en esta estación."""
        self.current_vehicle = vehicle
        self.status = StationStatus.OCUPADO
        self.hora_fin_atencion = fin
        self._busy_start = clock

    def finish_service(self, clock: float) -> "Vehicle":
        """
        Finaliza la atención del vehículo actual y acumula el tiempo de uso.
        Devuelve el vehículo que estaba siendo atendido.
        """
        assert self.current_vehicle is not None, "No hay vehículo siendo atendido."
        if self._busy_start is not None:
            self._total_busy_time += clock - self._busy_start
            self._busy_start = None
        vehicle = self.current_vehicle
        self.current_vehicle = None
        self.hora_fin_atencion = None
        return vehicle

    def set_blocked(self, clock: float) -> None:
        """
        Bloquea la estación (vehículo termina Frenos pero Luces está ocupado).
        El vehículo permanece en la estación.
        """
        self.status = StationStatus.BLOQUEADO
        self._block_start = clock
        # El tiempo de servicio en sí ya terminó; acumulamos lo que estuvimos ocupados
        if self._busy_start is not None:
            self._total_busy_time += clock - self._busy_start
            self._busy_start = None

    def unblock(self, clock: float) -> "Vehicle":
        """
        Desbloquea la estación, acumula el tiempo de bloqueo y
        devuelve el vehículo que estaba bloqueado.
        """
        assert self.current_vehicle is not None, "No hay vehículo bloqueado."
        if self._block_start is not None:
            self._total_blocked_time += clock - self._block_start
            self._block_start = None
        vehicle = self.current_vehicle
        self.current_vehicle = None
        self.status = StationStatus.LIBRE
        self.hora_fin_atencion = None
        return vehicle

    def set_free(self) -> None:
        """Libera la estación sin vehículo (queda disponible para el siguiente)."""
        self.current_vehicle = None
        self.status = StationStatus.LIBRE
        self.hora_fin_atencion = None
        self._busy_start = None

    # ------------------------------------------------------------------
    # Estadísticas
    # ------------------------------------------------------------------

    def total_busy_time(self) -> float:
        return self._total_busy_time

    def total_blocked_time(self) -> float:
        return self._total_blocked_time

    def __repr__(self) -> str:
        return (
            f"Station({self.tipo.value}, L{self.line_id}, "
            f"status={self.status.value}, "
            f"vehicle={self.current_vehicle})"
        )
