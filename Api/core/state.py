from __future__ import annotations

import json

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

        # Caché diferencial de vehículos activos: {id: dict}.
        # Se actualiza por evento en lugar de reconstruirse en cada snapshot.
        # snapshot_active_vehicles() devuelve COPIAS (correctness).
        self._active_vehicles_cache: dict[int, dict] = {}

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

    def track_vehicle_enter(self, v, linea: int | None = None) -> None:
        """Registra un vehículo nuevo en el caché diferencial."""
        self._active_vehicles_cache[v.id] = {
            "id": v.id,
            "tipo": v.tipo.value,
            "estado": v.estado.value,
            "linea": linea,
            "hora_llegada": round(v.hora_llegada, 2),
            "hora_inicio_bloqueo": None,
        }

    def track_vehicle_update(self, v, linea: int | None = None) -> None:
        """Actualiza el estado de un vehículo existente en el caché."""
        entry = self._active_vehicles_cache.get(v.id)
        if entry is not None:
            entry["estado"] = v.estado.value
            entry["linea"] = linea
            entry["hora_inicio_bloqueo"] = (
                round(v.hora_inicio_bloqueo, 2) if v.hora_inicio_bloqueo is not None else None
            )

    def track_vehicle_exit(self, vehicle_id: int) -> None:
        """Elimina un vehículo del caché al retirarse del sistema."""
        self._active_vehicles_cache.pop(vehicle_id, None)

    def snapshot_active_vehicles(self) -> list[dict]:
        """
        Devuelve el estado de todos los vehículos activos en el sistema.
        OPTIMIZACIÓN: Lee directamente el caché diferencial en O(n) trivial;
        no recorre la cola ni las estaciones.
        """
        return list(self._active_vehicles_cache.values())

    def snapshot_active_vehicles_as_json(self) -> str:
        """
        Serializa snapshot_active_vehicles() como JSON string.
        Usado exclusivamente para persistir la columna en el CSV.
        """
        return json.dumps(self.snapshot_active_vehicles(), ensure_ascii=False)
