from __future__ import annotations

from typing import TYPE_CHECKING

from core.event import Event
from entities.vehicle import Vehicle, VehicleType
import events._routing as routing

if TYPE_CHECKING:
    from core.simulation import Simulation


class LlegadaAuto(Event):
    """
    Evento: llegada de un automóvil a la planta.

    Genera un nuevo vehículo de tipo Auto y lo rutea a la primera estación
    de Frenos libre, o lo encola en la cola de entrada (baja prioridad).
    Si las puertas siguen abiertas, agenda la próxima llegada de auto.
    """

    def __init__(self, timestamp: float) -> None:
        super().__init__(timestamp)

    @property
    def nombre(self) -> str:
        return "Llegada Auto"

    def process(self, sim: "Simulation") -> list[Event]:
        state = sim.state
        new_events: list[Event] = []

        # Crear el vehículo
        vehicle = Vehicle(
            id=state.next_vehicle_id(),
            tipo=VehicleType.AUTO,
            hora_llegada=state.clock,
        )

        # Rutear: a Frenos libre o a la cola
        new_events.extend(routing._route_vehicle_to_frenos(vehicle, sim))

        # Programar la próxima llegada de auto si las puertas están abiertas
        if state.puertas_abiertas:
            next_t = state.clock + sim.sample_llegada_auto()
            state.prox_llegada_auto = next_t
            new_events.append(LlegadaAuto(timestamp=next_t))
        else:
            state.prox_llegada_auto = None

        return new_events
