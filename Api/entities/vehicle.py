from __future__ import annotations

from enum import Enum


class VehicleType(Enum):
    AUTO = "Auto"
    CAMIONETA = "Camioneta"


class VehicleState(Enum):
    ESPERANDO = "Esperando"
    EN_FRENOS = "En Frenos"
    BLOQUEADO_EN_FRENOS = "Bloqueado en Frenos"
    EN_LUCES = "En Luces"
    RETIRADO = "Retirado"


class Vehicle:
    """
    Representa un vehículo que ingresa al sistema de revisión técnica.

    Atributos:
        id: Identificador único secuencial.
        tipo: Tipo de vehículo (Auto o Camioneta).
        estado: Estado actual dentro del sistema.
        linea_asignada: ID de la línea de inspección asignada (None si está en cola).
        hora_llegada: Minuto de simulación en que el vehículo llegó al predio.
        hora_inicio_espera: Minuto en que entró a la cola (puede diferir si
                            pasa directo a servicio).
        hora_inicio_servicio: Minuto en que comenzó a ser atendido en Frenos.
        hora_inicio_bloqueo: Minuto en que Frenos quedó bloqueado con este vehículo.
    """

    def __init__(
        self,
        id: int,
        tipo: VehicleType,
        hora_llegada: float,
    ) -> None:
        self.id = id
        self.tipo = tipo
        self.estado: VehicleState = VehicleState.ESPERANDO
        self.linea_asignada: int | None = None

        self.hora_llegada: float = hora_llegada
        self.hora_inicio_espera: float = hora_llegada
        self.hora_inicio_servicio: float | None = None
        self.hora_inicio_bloqueo: float | None = None
        # Marcador para evitar doble conteo de estadísticas:
        # True si el vehículo pasó por la cola y ya fue contabilizado en _dequeue_to_frenos.
        self._already_counted: bool = False

    def tiempo_espera_en_cola(self) -> float:
        """
        Tiempo que el vehículo esperó en la cola de entrada antes de ser atendido.
        Retorna 0 si no esperó en cola (ingresó directo a Frenos).
        """
        if self.hora_inicio_servicio is None:
            return 0.0
        return max(0.0, self.hora_inicio_servicio - self.hora_inicio_espera)

    def __repr__(self) -> str:
        return f"Vehicle(id={self.id}, tipo={self.tipo.value}, estado={self.estado.value})"
