from __future__ import annotations

from typing import TYPE_CHECKING

from core.event import Event

if TYPE_CHECKING:
    from core.simulation import Simulation


class CierrePuertas(Event):
    """
    Evento: cierre de las puertas de ingreso al predio a las 16:00 hs (960 min).

    A partir de este momento la bandera `puertas_abiertas` del estado queda en
    False. Ningún evento de llegada posterior generará nuevas llegadas.
    Los vehículos que ya están en cola o en las líneas continuarán siendo atendidos
    hasta que la FEL quede vacía (fin natural de la simulación).
    """

    def __init__(self, timestamp: float) -> None:
        super().__init__(timestamp)

    @property
    def nombre(self) -> str:
        return "Cierre de Puertas"

    def process(self, sim: "Simulation") -> list[Event]:
        from events.llegada_auto import LlegadaAuto
        from events.llegada_camioneta import LlegadaCamioneta

        sim.state.puertas_abiertas = False
        sim.state.prox_llegada_auto = None
        sim.state.prox_llegada_camioneta = None

        # Eliminar de la FEL los eventos de llegada ya agendados pero aún no procesados.
        sim.fel.remove_by_type(LlegadaAuto)
        sim.fel.remove_by_type(LlegadaCamioneta)

        # No genera eventos nuevos; la simulación sigue con los eventos ya agendados.
        return []
