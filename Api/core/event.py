from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.simulation import Simulation


class Event(ABC):
    """
    Clase abstracta base para todos los eventos de la simulación.

    Cada evento tiene un timestamp que indica en qué instante del reloj de
    simulación debe ser procesado. El método `process` encapsula la lógica de
    transición de estado y devuelve una lista de nuevos eventos que deben ser
    agendados en la FEL.
    """

    def __init__(self, timestamp: float) -> None:
        self.timestamp = timestamp

    @abstractmethod
    def process(self, sim: "Simulation") -> list["Event"]:
        """
        Procesa el evento aplicando la transición de estado correspondiente.

        Args:
            sim: Referencia a la simulación, para acceder y modificar el estado.

        Returns:
            Lista de eventos nuevos generados (pueden ser cero o más).
        """
        ...

    @property
    @abstractmethod
    def nombre(self) -> str:
        """Nombre descriptivo del evento para registrar en el vector de estado."""
        ...

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(t={self.timestamp:.4f})"
