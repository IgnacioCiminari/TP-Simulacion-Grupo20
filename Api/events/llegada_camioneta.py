from __future__ import annotations

from typing import TYPE_CHECKING

from core.event import Event
from entities.vehicle import Vehicle, VehicleType
import events._routing as routing

if TYPE_CHECKING:
    from core.simulation import Simulation


class LlegadaCamioneta(Event):
    """
    Evento: llegada de una camioneta a la planta.

    Genera un nuevo vehículo de tipo Camioneta y lo rutea a la primera estación
    de Frenos libre, o lo encola en la cola de ingreso con prioridad alta
    (las camionetas son despachadas antes que los autos al liberar Frenos).
    Si las puertas siguen abiertas, agenda la próxima llegada de camioneta.
    """

    def __init__(self, timestamp: float) -> None:
        super().__init__(timestamp)

    @property
    def nombre(self) -> str:
        return "Llegada Camioneta"

    def process(self, sim: "Simulation") -> list[Event]:
        state = sim.state
        new_events: list[Event] = []

        # Crear el vehículo
        vehicle = Vehicle(
            id=state.next_vehicle_id(),
            tipo=VehicleType.CAMIONETA,
            hora_llegada=state.clock,
        )

        # Rutear: a Frenos libre o a la cola con prioridad
        new_events.extend(routing._route_vehicle_to_frenos(vehicle, sim))

        # Programar la próxima llegada de camioneta si las puertas están abiertas
        if state.puertas_abiertas:
            next_t = state.clock + sim.sample_llegada_camioneta()
            state.prox_llegada_camioneta = next_t
            new_events.append(LlegadaCamioneta(timestamp=next_t))
        else:
            state.prox_llegada_camioneta = None

        return new_events
