//! Vector de estado global de un día de simulación.

use serde::Serialize;

use crate::entities::line::InspectionLine;
use crate::entities::queue::PriorityVehicleQueue;
use crate::entities::vehicle::{Vehicle, VehicleId, VehicleState, VehicleType};
use crate::stats::tracker::py_round;

/// Foto de un vehículo activo, tal como se exporta en la columna `Clientes_Activos`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ActiveVehicle {
    pub id: VehicleId,
    pub tipo: &'static str,
    pub estado: &'static str,
    pub linea: Option<u32>,
    pub hora_llegada: f64,
    pub hora_inicio_bloqueo: Option<f64>,
}

/// Centraliza toda la información mutable del sistema: el reloj, las líneas,
/// la cola de entrada y los acumuladores. Los eventos interactúan solo a través
/// de este objeto.
///
/// Los vehículos viven en un arena (`vehicles`, indexado por `id - 1`); las
/// estaciones y la cola guardan solo el `id`.
pub struct SimulationState {
    pub clock: f64,

    // Infraestructura de la planta
    pub lines: Vec<InspectionLine>,
    pub entry_queue: PriorityVehicleQueue,

    // Control de flujo de la jornada
    pub puertas_abiertas: bool,

    // Próximos eventos de llegada (para registrar en el vector de estado)
    pub prox_llegada_auto: Option<f64>,
    pub prox_llegada_camioneta: Option<f64>,

    // Arena de vehículos del día
    pub vehicles: Vec<Vehicle>,

    // Acumuladores
    pub total_espera_autos: f64,
    pub total_espera_camionetas: f64,
    pub count_autos_atendidos: u64,
    pub count_camionetas_atendidas: u64,

    // Hora de finalización real de la jornada
    pub fin_jornada: Option<f64>,

    // Primer índice del arena que puede seguir activo (los vehículos se
    // retiran aproximadamente en orden; acelera el snapshot).
    first_active: usize,
}

impl SimulationState {
    pub fn new(lines: Vec<InspectionLine>) -> Self {
        Self {
            clock: 0.0,
            lines,
            entry_queue: PriorityVehicleQueue::new(),
            puertas_abiertas: true,
            prox_llegada_auto: None,
            prox_llegada_camioneta: None,
            vehicles: Vec::with_capacity(64),
            total_espera_autos: 0.0,
            total_espera_camionetas: 0.0,
            count_autos_atendidos: 0,
            count_camionetas_atendidas: 0,
            fin_jornada: None,
            first_active: 0,
        }
    }

    /// Crea un vehículo nuevo con ID único e incremental y devuelve su ID.
    #[inline]
    pub fn new_vehicle(&mut self, tipo: VehicleType, hora_llegada: f64) -> VehicleId {
        let id = self.vehicles.len() as VehicleId + 1;
        self.vehicles.push(Vehicle::new(id, tipo, hora_llegada));
        id
    }

    #[inline]
    pub fn vehicle(&self, id: VehicleId) -> &Vehicle {
        &self.vehicles[(id - 1) as usize]
    }

    #[inline]
    pub fn vehicle_mut(&mut self, id: VehicleId) -> &mut Vehicle {
        &mut self.vehicles[(id - 1) as usize]
    }

    /// Índice de la primera línea cuya estación de Frenos esté libre
    /// (prioriza la de menor índice para mantener determinismo).
    #[inline]
    pub fn get_free_brake_line(&self) -> Option<usize> {
        self.lines.iter().position(|l| l.frenos.is_free())
    }

    /// `true` si no hay ningún vehículo en colas ni en estaciones.
    pub fn all_empty(&self) -> bool {
        self.entry_queue.is_empty()
            && self
                .lines
                .iter()
                .all(|l| l.frenos.current_vehicle.is_none() && l.luces.current_vehicle.is_none())
    }

    /// Avanza el puntero de vehículos activos tras un retiro.
    #[inline]
    pub fn track_vehicle_exit(&mut self) {
        while self.first_active < self.vehicles.len()
            && self.vehicles[self.first_active].estado == VehicleState::Retirado
        {
            self.first_active += 1;
        }
    }

    /// Estado de todos los vehículos activos (en orden de llegada).
    pub fn snapshot_active_vehicles(&self) -> Vec<ActiveVehicle> {
        self.vehicles[self.first_active..]
            .iter()
            .filter(|v| v.estado != VehicleState::Retirado)
            .map(|v| ActiveVehicle {
                id: v.id,
                tipo: v.tipo.value(),
                estado: v.estado.value(),
                linea: v.linea_asignada,
                hora_llegada: py_round(v.hora_llegada, 2),
                hora_inicio_bloqueo: v.hora_inicio_bloqueo.map(|h| py_round(h, 2)),
            })
            .collect()
    }
}
