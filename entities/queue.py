from __future__ import annotations

from collections import deque
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from entities.vehicle import Vehicle
from entities.vehicle import VehicleType


class PriorityVehicleQueue:
    """
    Cola de entrada al sistema con prioridad para camionetas sobre autos.

    Implementada internamente con dos colas FIFO separadas:
    - `_camionetas`: vehículos de tipo Camioneta (alta prioridad).
    - `_autos`: vehículos de tipo Auto (baja prioridad).

    Al desencolar, se consulta primero la cola de camionetas. Solo si está vacía
    se despacha un auto. Esto garantiza la prioridad absoluta de las camionetas
    sin necesidad de reordenar la estructura.
    """

    def __init__(self) -> None:
        self._camionetas: deque["Vehicle"] = deque()
        self._autos: deque["Vehicle"] = deque()

    def enqueue(self, vehicle: "Vehicle") -> None:
        """Agrega un vehículo a la subcola correspondiente a su tipo."""
        if vehicle.tipo == VehicleType.CAMIONETA:
            self._camionetas.append(vehicle)
        else:
            self._autos.append(vehicle)

    def dequeue(self) -> "Vehicle | None":
        """
        Despacha el siguiente vehículo con mayor prioridad.
        Retorna None si ambas colas están vacías.
        """
        if self._camionetas:
            return self._camionetas.popleft()
        if self._autos:
            return self._autos.popleft()
        return None

    def count_autos(self) -> int:
        return len(self._autos)

    def count_camionetas(self) -> int:
        return len(self._camionetas)

    def all_vehicles(self) -> list["Vehicle"]:
        """Devuelve todos los vehículos en cola (camionetas primero, luego autos)."""
        return list(self._camionetas) + list(self._autos)

    def __bool__(self) -> bool:
        return bool(self._camionetas) or bool(self._autos)

    def __len__(self) -> int:
        return len(self._camionetas) + len(self._autos)

    def __repr__(self) -> str:
        return (
            f"PriorityVehicleQueue("
            f"camionetas={len(self._camionetas)}, "
            f"autos={len(self._autos)})"
        )
