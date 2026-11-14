//! Evento: llegada de un automóvil a la planta.
//!
//! Crea un vehículo de tipo Auto y lo rutea a la primera estación de Frenos
//! libre, o lo encola (baja prioridad). Si las puertas siguen abiertas, agenda
//! la próxima llegada de auto.

use crate::core::event::{Event, EventKind};
use crate::core::simulation::DaySim;
use crate::entities::vehicle::VehicleType;
use crate::events::_routing::route_vehicle_to_frenos;

pub const NOMBRE: &str = "Llegada Auto";

pub fn process(sim: &mut DaySim) {
    let clock = sim.state.clock;
    let vid = sim.state.new_vehicle(VehicleType::Auto, clock);

    // Rutear: a Frenos libre o a la cola
    route_vehicle_to_frenos(sim, vid);

    // Programar la próxima llegada si las puertas están abiertas
    if sim.state.puertas_abiertas {
        let next_t = clock + sim.sample_llegada_auto();
        sim.state.prox_llegada_auto = Some(next_t);
        sim.schedule(Event::new(next_t, EventKind::LlegadaAuto));
    } else {
        sim.state.prox_llegada_auto = None;
    }
}
