//! Línea de inspección: Frenos (primera) → Luces (segunda).
//!
//! Si Luces está ocupado al finalizar Frenos, Frenos queda bloqueado.

use crate::entities::station::{Station, StationType};

#[derive(Debug, Clone)]
pub struct InspectionLine {
    pub id: u32,
    pub frenos: Station,
    pub luces: Station,
}

impl InspectionLine {
    pub fn new(id: u32) -> Self {
        Self {
            id,
            frenos: Station::new(StationType::Frenos, id),
            luces: Station::new(StationType::Luces, id),
        }
    }
}
