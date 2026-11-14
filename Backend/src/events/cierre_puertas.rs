//! Evento: cierre de las puertas de ingreso (16:00 hs por defecto).
//!
//! Desde este momento no se generan nuevas llegadas. Los vehículos que ya están
//! en cola o en las líneas siguen siendo atendidos hasta vaciar la FEL.

use crate::core::event::EventKind;
use crate::core::simulation::DaySim;

pub const NOMBRE: &str = "Cierre de Puertas";

pub fn process(sim: &mut DaySim) {
    sim.state.puertas_abiertas = false;
    sim.state.prox_llegada_auto = None;
    sim.state.prox_llegada_camioneta = None;

    // Eliminar de la FEL las llegadas ya agendadas pero aún no procesadas.
    sim.fel.remove_by_kind(|k| {
        matches!(k, EventKind::LlegadaAuto | EventKind::LlegadaCamioneta)
    });
}
