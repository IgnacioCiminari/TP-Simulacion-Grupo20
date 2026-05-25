"""
Tests unitarios para la cola con prioridad.
Verifica que las camionetas siempre sean despachadas antes que los autos,
independientemente del orden de llegada.
"""

import pytest
from entities.queue import PriorityVehicleQueue
from entities.vehicle import Vehicle, VehicleType


def _make_auto(id: int) -> Vehicle:
    return Vehicle(id=id, tipo=VehicleType.AUTO, hora_llegada=0.0)


def _make_camioneta(id: int) -> Vehicle:
    return Vehicle(id=id, tipo=VehicleType.CAMIONETA, hora_llegada=0.0)


class TestPriorityVehicleQueue:

    def test_camioneta_priority_over_auto(self):
        """Una camioneta encolada después de un auto debe salir primero."""
        q = PriorityVehicleQueue()
        auto = _make_auto(1)
        camioneta = _make_camioneta(2)
        q.enqueue(auto)
        q.enqueue(camioneta)

        first = q.dequeue()
        assert first is camioneta, "La camioneta debe salir antes que el auto."

    def test_fifo_among_camionetas(self):
        """Dos camionetas deben despacharse en orden FIFO."""
        q = PriorityVehicleQueue()
        c1 = _make_camioneta(1)
        c2 = _make_camioneta(2)
        q.enqueue(c1)
        q.enqueue(c2)

        assert q.dequeue() is c1
        assert q.dequeue() is c2

    def test_fifo_among_autos(self):
        """Dos autos deben despacharse en orden FIFO si no hay camionetas."""
        q = PriorityVehicleQueue()
        a1 = _make_auto(1)
        a2 = _make_auto(2)
        q.enqueue(a1)
        q.enqueue(a2)

        assert q.dequeue() is a1
        assert q.dequeue() is a2

    def test_dequeue_empty_returns_none(self):
        """Desencolar una cola vacía debe retornar None."""
        q = PriorityVehicleQueue()
        assert q.dequeue() is None

    def test_count_methods(self):
        """Los contadores por tipo deben ser correctos."""
        q = PriorityVehicleQueue()
        q.enqueue(_make_auto(1))
        q.enqueue(_make_auto(2))
        q.enqueue(_make_camioneta(3))

        assert q.count_autos() == 2
        assert q.count_camionetas() == 1
        assert len(q) == 3

    def test_bool_empty(self):
        """La cola vacía debe evaluarse como False."""
        q = PriorityVehicleQueue()
        assert not q

    def test_bool_non_empty(self):
        """La cola con al menos un elemento debe evaluarse como True."""
        q = PriorityVehicleQueue()
        q.enqueue(_make_auto(1))
        assert q

    def test_all_camionetas_before_any_auto(self):
        """Con múltiples vehículos mezclados, todos los camionetas salen antes que cualquier auto."""
        q = PriorityVehicleQueue()
        q.enqueue(_make_auto(1))
        q.enqueue(_make_camioneta(2))
        q.enqueue(_make_auto(3))
        q.enqueue(_make_camioneta(4))

        salidas = [q.dequeue() for _ in range(4)]
        tipos = [v.tipo for v in salidas]

        # Las dos camionetas deben estar primero
        assert tipos[0] == VehicleType.CAMIONETA
        assert tipos[1] == VehicleType.CAMIONETA
        assert tipos[2] == VehicleType.AUTO
        assert tipos[3] == VehicleType.AUTO
