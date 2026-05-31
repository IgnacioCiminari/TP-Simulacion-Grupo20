from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.simulation import Simulation
    from core.event import Event

from entities.vehicle import Vehicle, VehicleState
from events.fin_frenos import FinRevisionFrenos


def _route_vehicle_to_frenos(
    vehicle: Vehicle,
    sim: "Simulation",
) -> list["Event"]:
    """
    Lógica de ruteo compartida por LlegadaAuto y LlegadaCamioneta.
    Intenta asignar el vehículo a una estación de Frenos libre. Si no hay ninguna,
    lo encola en la cola de entrada con prioridad.

    Returns:
        Lista de eventos nuevos generados (un FinRevisionFrenos si entra a servicio,
        o vacía si va a la cola).
    """
    free_line = sim.state.get_free_brake_line()

    if free_line is not None:
        # El vehículo entra directamente a la estación de Frenos.
        tiempo_frenos = sim.sample_tiempo_frenos(free_line.id)
        fin = sim.state.clock + tiempo_frenos

        vehicle.hora_inicio_servicio = sim.state.clock
        vehicle.linea_asignada = free_line.id
        vehicle.estado = VehicleState.EN_FRENOS

        free_line.frenos.start_service(vehicle, sim.state.clock, fin)
        sim.state.track_vehicle_enter(vehicle, linea=free_line.id)

        return [FinRevisionFrenos(timestamp=fin, line_id=free_line.id)]
    else:
        # Va a la cola de ingreso
        vehicle.estado = VehicleState.ESPERANDO
        sim.state.entry_queue.enqueue(vehicle)
        sim.state.track_vehicle_enter(vehicle, linea=None)
        return []
