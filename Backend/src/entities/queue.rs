//! Cola de entrada con prioridad absoluta de camionetas sobre autos.
//!
//! Dos colas FIFO separadas: al desencolar se consulta primero la de camionetas.

use std::collections::VecDeque;

use crate::entities::vehicle::{VehicleId, VehicleType};

#[derive(Debug, Clone, Default)]
pub struct PriorityVehicleQueue {
    camionetas: VecDeque<VehicleId>,
    autos: VecDeque<VehicleId>,
}

impl PriorityVehicleQueue {
    pub fn new() -> Self {
        Self::default()
    }

    /// Agrega un vehículo a la subcola correspondiente a su tipo.
    #[inline]
    pub fn enqueue(&mut self, vehicle: VehicleId, tipo: VehicleType) {
        match tipo {
            VehicleType::Camioneta => self.camionetas.push_back(vehicle),
            VehicleType::Auto => self.autos.push_back(vehicle),
        }
    }

    /// Despacha el siguiente vehículo con mayor prioridad (`None` si está vacía).
    #[inline]
    pub fn dequeue(&mut self) -> Option<VehicleId> {
        self.camionetas
            .pop_front()
            .or_else(|| self.autos.pop_front())
    }

    #[inline]
    pub fn count_autos(&self) -> usize {
        self.autos.len()
    }

    #[inline]
    pub fn count_camionetas(&self) -> usize {
        self.camionetas.len()
    }

    /// Todos los vehículos en cola (camionetas primero, luego autos).
    pub fn all_vehicles(&self) -> Vec<VehicleId> {
        self.camionetas.iter().chain(self.autos.iter()).copied().collect()
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.camionetas.len() + self.autos.len()
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.camionetas.is_empty() && self.autos.is_empty()
    }
}
