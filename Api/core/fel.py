from __future__ import annotations

import heapq
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.event import Event


class EventQueue:
    """
    Cola de eventos futuros (FEL - Future Event List) implementada como un heap
    de mínimos ordenado por timestamp. Permite desempate por contador de orden
    de inserción para garantizar estabilidad (FIFO entre eventos del mismo instante).
    """

    def __init__(self) -> None:
        self._heap: list[tuple[float, int, "Event"]] = []
        self._counter: int = 0

    def push(self, event: "Event") -> None:
        heapq.heappush(self._heap, (event.timestamp, self._counter, event))
        self._counter += 1

    def pop(self) -> "Event":
        _, _, event = heapq.heappop(self._heap)
        return event

    def peek(self) -> "Event | None":
        if self._heap:
            return self._heap[0][2]
        return None

    def remove_by_type(self, event_type: type) -> int:
        """
        Elimina todos los eventos de la FEL cuyo tipo sea exactamente `event_type`.
        Reconstruye el heap tras la eliminación.
        Devuelve la cantidad de eventos eliminados.
        """
        original_len = len(self._heap)
        self._heap = [item for item in self._heap if not isinstance(item[2], event_type)]
        heapq.heapify(self._heap)
        return original_len - len(self._heap)

    def __len__(self) -> int:
        return len(self._heap)

    def __bool__(self) -> bool:
        return bool(self._heap)
