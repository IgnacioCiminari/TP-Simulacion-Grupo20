from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from entities.station import Station


@dataclass
class InspectionLine:
    """
    Línea de inspección compuesta por dos estaciones secuenciales:
    Frenos (primera) y Luces (segunda).

    El vehículo debe pasar obligatoriamente por Frenos antes de Luces.
    Si Luces está ocupado al finalizar Frenos, Frenos queda bloqueado.
    """

    id: int
    frenos: "Station"
    luces: "Station"

    def __repr__(self) -> str:
        return (
            f"Line(id={self.id}, "
            f"frenos={self.frenos.status.value}, "
            f"luces={self.luces.status.value})"
        )
