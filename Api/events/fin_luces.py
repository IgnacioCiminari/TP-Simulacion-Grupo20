from __future__ import annotations

from typing import TYPE_CHECKING

from core.event import Event
from entities.vehicle import VehicleState

if TYPE_CHECKING:
    from core.simulation import Simulation


class FinRevisionLuces(Event):
    """
    Evento: un vehículo termina su revisión en la estación de Luces de la
    línea indicada.

    Pasos:
    1. El vehículo sale del sistema. Se acumula su tiempo de espera en cola
       si no fue contabilizado aún al salir directo desde la llegada (sin espera).
    2. Si Frenos de la misma línea estaba BLOQUEADO:
       a. Se desbloquea Frenos.
       b. El vehículo bloqueado pasa a Luces y se agenda FinRevisionLuces.
       c. Frenos queda libre y puede tomar el siguiente de la cola.
    3. Si Frenos no estaba bloqueado, Luces queda libre.
    """

    def __init__(self, timestamp: float, line_id: int) -> None:
        super().__init__(timestamp)
        self.line_id = line_id

    @property
    def nombre(self) -> str:
        return f"Fin Revisión Luces L{self.line_id}"

    def process(self, sim: "Simulation") -> list[Event]:
        from events.fin_frenos import _dequeue_to_frenos

        state = sim.state
        new_events: list[Event] = []

        line = next(l for l in state.lines if l.id == self.line_id)
        frenos = line.frenos
        luces = line.luces

        # El vehículo sale del sistema
        # Registrar tiempo real de servicio en Luces antes de finish_service
        if luces._busy_start is not None:
            tiempo_servicio_luces = state.clock - luces._busy_start
            sim.tracker.register_servicio_luces(self.line_id, tiempo_servicio_luces)

        exiting_vehicle = luces.finish_service(state.clock)
        exiting_vehicle.estado = VehicleState.RETIRADO

        # Acumular estadísticas de espera en cola.
        # El tiempo de espera es 0 para vehículos que entraron directo a Frenos.
        # Los vehículos que sí pasaron por la cola ya tienen su espera registrada
        # en _dequeue_to_frenos; aquí contabilizamos el CONTADOR de atendidos
        # para todos los vehículos (directos o por cola).
        if not exiting_vehicle._already_counted:
            wait = exiting_vehicle.tiempo_espera_en_cola()
            if exiting_vehicle.tipo.value == "Auto":
                state.total_espera_autos += wait
                state.count_autos_atendidos += 1
                sim.row_context["tiempo_espera_auto"] = wait
            else:
                state.total_espera_camionetas += wait
                state.count_camionetas_atendidas += 1
                sim.row_context["tiempo_espera_camioneta"] = wait

        luces.set_free()

        # Verificar si Frenos estaba bloqueado en esta línea
        if frenos.is_blocked():
            # Desbloquear: el vehículo bloqueado pasa a Luces
            blocked_vehicle = frenos.unblock(state.clock)

            # Acumular tiempo de bloqueo en el tracker y registrar en el contexto
            if blocked_vehicle.hora_inicio_bloqueo is not None:
                bloqueo = state.clock - blocked_vehicle.hora_inicio_bloqueo
                sim.tracker.acum_bloqueo_frenos[line.id] = (
                    sim.tracker.acum_bloqueo_frenos.get(line.id, 0.0) + bloqueo
                )
                sim.row_context[f"tiempo_bloqueo_l{line.id}"] = bloqueo

            # Mover el vehículo bloqueado a Luces.
            # line_id se pasa para que el RND quede en la columna correcta del CSV.
            tiempo_luces = sim.sample_tiempo_luces(self.line_id)
            fin_luces = state.clock + tiempo_luces

            blocked_vehicle.estado = VehicleState.EN_LUCES
            blocked_vehicle.hora_inicio_bloqueo = None
            luces.start_service(blocked_vehicle, state.clock, fin_luces)

            new_events.append(FinRevisionLuces(timestamp=fin_luces, line_id=self.line_id))

            # Frenos queda libre: intentar tomar el siguiente de la cola
            new_events.extend(_dequeue_to_frenos(line, sim))

        # Si no había bloqueo, Luces ya quedó libre arriba. No hay nada más que hacer.

        return new_events
