from __future__ import annotations

from entities.line import InspectionLine
from entities.queue import PriorityVehicleQueue


class SimulationState:
    """
    Vector de estado global de la simulación.

    Centraliza toda la información mutable del sistema: el reloj, las líneas
    de inspección, la cola de entrada y los acumuladores de estadísticas.
    Los eventos interactúan exclusivamente a través de este objeto.
    """

    def __init__(self, lines: list[InspectionLine]) -> None:
        self.clock: float = 0.0

        # Infraestructura de la planta
        self.lines: list[InspectionLine] = lines
        self.entry_queue: PriorityVehicleQueue = PriorityVehicleQueue()

        # Control de flujo de la jornada
        self.puertas_abiertas: bool = True

        # Próximos eventos de llegada (para registrar en el vector de estado)
        self.prox_llegada_auto: float | None = None
        self.prox_llegada_camioneta: float | None = None

        # Contador global de vehículos (para asignar IDs únicos)
        self._vehicle_counter: int = 0

        # Acumuladores de estadísticas globales
        self.total_espera_autos: float = 0.0
        self.total_espera_camionetas: float = 0.0
        self.count_autos_atendidos: int = 0
        self.count_camionetas_atendidas: int = 0

        # Hora de finalización real de la jornada
        self.fin_jornada: float | None = None

    def next_vehicle_id(self) -> int:
        """Genera y devuelve un ID único e incremental para cada vehículo nuevo."""
        self._vehicle_counter += 1
        return self._vehicle_counter

    def get_free_brake_line(self) -> InspectionLine | None:
        """
        Devuelve la primera línea cuya estación de Frenos esté libre,
        o None si todas están ocupadas/bloqueadas.
        Se prioriza la línea de menor índice para mantener determinismo.
        """
        for line in self.lines:
            if line.frenos.is_free():
                return line
        return None

    def all_empty(self) -> bool:
        """
        Devuelve True si no hay ningún vehículo en el sistema:
        ni en colas ni en ninguna estación de ninguna línea.
        """
        if self.entry_queue:
            return False
        for line in self.lines:
            if line.frenos.current_vehicle is not None:
                return False
            if line.luces.current_vehicle is not None:
                return False
        return True

    def snapshot_active_vehicles(self) -> str:
        """
        Serializa el estado de todos los vehículos activos en el sistema
        (tanto en colas como en estaciones) en formato de texto para el CSV.
        Formato: [ID:X, Tipo, Estado, L:N]; ...
        """
        parts: list[str] = []

        # Vehículos en la cola de espera
        for v in self.entry_queue.all_vehicles():
            parts.append(f"[ID:{v.id}, {v.tipo.value}, {v.estado.value}]")

        # Vehículos en estaciones
        for line in self.lines:
            for station in (line.frenos, line.luces):
                if station.current_vehicle is not None:
                    v = station.current_vehicle
                    parts.append(
                        f"[ID:{v.id}, {v.tipo.value}, {v.estado.value}, L:{line.id}]"
                    )

        return "; ".join(parts) if parts else ""
