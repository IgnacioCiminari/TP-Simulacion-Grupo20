from __future__ import annotations

from typing import TYPE_CHECKING

from core.event import Event
from entities.vehicle import VehicleState
from entities.station import StationStatus

if TYPE_CHECKING:
    from core.simulation import Simulation


class FinRevisionFrenos(Event):
    """
    Evento: un vehículo termina su revisión en la estación de Frenos de la
    línea indicada.

    Posibles transiciones:
    1. Luces libre → transfiere el vehículo a Luces y agenda FinRevisionLuces.
       Frenos queda libre y toma el siguiente vehículo de la cola si hay alguno.
    2. Luces ocupado → Frenos queda BLOQUEADO. El vehículo permanece en Frenos
       hasta que Luces se libere (evento FinRevisionLuces lo desbloquea).
    """

    def __init__(self, timestamp: float, line_id: int) -> None:
        super().__init__(timestamp)
        self.line_id = line_id

    @property
    def nombre(self) -> str:
        return f"Fin Revisión Frenos L{self.line_id}"

    def process(self, sim: "Simulation") -> list[Event]:
        from events.fin_luces import FinRevisionLuces

        state = sim.state
        new_events: list[Event] = []

        # Obtener la línea correspondiente
        line = next(l for l in state.lines if l.id == self.line_id)
        frenos = line.frenos
        luces = line.luces

        # El vehículo termina Frenos
        # Registrar el tiempo real de servicio en frenos antes de finish_service
        if vehicle := frenos.current_vehicle:
            if vehicle.hora_inicio_servicio is not None:
                tiempo_servicio_frenos = state.clock - vehicle.hora_inicio_servicio
                sim.tracker.register_servicio_frenos(self.line_id, tiempo_servicio_frenos)

        vehicle = frenos.finish_service(state.clock)

        if luces.is_free():
            # --- Camino 1: Luces libre → transferir vehículo ---
            # line_id se pasa para que el RND quede registrado en la columna correcta
            tiempo_luces = sim.sample_tiempo_luces(self.line_id)
            fin_luces = state.clock + tiempo_luces

            vehicle.estado = VehicleState.EN_LUCES
            luces.start_service(vehicle, state.clock, fin_luces)

            new_events.append(FinRevisionLuces(timestamp=fin_luces, line_id=self.line_id))

            # Frenos queda libre → tomar siguiente de la cola
            new_events.extend(_dequeue_to_frenos(line, sim))
        else:
            # --- Camino 2: Luces ocupado → bloquear Frenos ---
            vehicle.estado = VehicleState.BLOQUEADO_EN_FRENOS
            vehicle.hora_inicio_bloqueo = state.clock
            frenos.current_vehicle = vehicle
            frenos.set_blocked(state.clock)
            # No se puede atender el siguiente de la cola hasta que Luces se libere

        return new_events


def _dequeue_to_frenos(line, sim: "Simulation") -> list[Event]:
    """
    Intenta tomar el siguiente vehículo de la cola de entrada y enviarlo
    a la estación de Frenos de la línea dada.

    Returns:
        Lista con un FinRevisionFrenos si hubo vehículo disponible, o vacía.
    """
    state = sim.state
    next_vehicle = state.entry_queue.dequeue()

    if next_vehicle is None:
        # No hay nadie en la cola: Frenos queda libre
        line.frenos.set_free()
        return []

    # Registrar el tiempo de espera en cola y marcar como ya contabilizado.
    # FinRevisionLuces salteará este vehículo al verificar _already_counted.
    wait_time = state.clock - next_vehicle.hora_inicio_espera
    if next_vehicle.tipo.value == "Auto":
        state.total_espera_autos += wait_time
        state.count_autos_atendidos += 1
        sim.row_context["tiempo_espera_auto"] = wait_time
    else:
        state.total_espera_camionetas += wait_time
        state.count_camionetas_atendidas += 1
        sim.row_context["tiempo_espera_camioneta"] = wait_time
    next_vehicle._already_counted = True

    # Enviar el vehículo a Frenos.
    # line.id se pasa para que el RND quede en la columna correcta del CSV.
    tiempo_frenos = sim.sample_tiempo_frenos(line.id)
    fin = state.clock + tiempo_frenos

    next_vehicle.hora_inicio_servicio = state.clock
    next_vehicle.linea_asignada = line.id
    next_vehicle.estado = VehicleState.EN_FRENOS

    line.frenos.start_service(next_vehicle, state.clock, fin)

    from events.fin_frenos import FinRevisionFrenos
    return [FinRevisionFrenos(timestamp=fin, line_id=line.id)]
