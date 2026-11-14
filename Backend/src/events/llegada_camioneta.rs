//! Evento: llegada de una camioneta a la planta.
//!
//! Crea un vehículo de tipo Camioneta y lo rutea a la primera estación de
//! Frenos libre, o lo encola con prioridad alta. Si las puertas siguen
//! abiertas, agenda la próxima llegada de camioneta.

use crate::core::event::{Event, EventKind};
use crate::core::simulation::DaySim;
use crate::entities::vehicle::VehicleType;
use crate::events::_routing::route_vehicle_to_frenos;

pub const NOMBRE: &str = "Llegada Camioneta";

pub fn process(sim: &mut DaySim) {
    let clock = sim.state.clock;
    let vid = sim.state.new_vehicle(VehicleType::Camioneta, clock);

    // Rutear: a Frenos libre o a la cola con prioridad
    route_vehicle_to_frenos(sim, vid);

    // Programar la próxima llegada si las puertas están abiertas
    if sim.state.puertas_abiertas {
        let next_t = clock + sim.sample_llegada_camioneta();
        sim.state.prox_llegada_camioneta = Some(next_t);
        sim.schedule(Event::new(next_t, EventKind::LlegadaCamioneta));
    } else {
        sim.state.prox_llegada_camioneta = None;
    }
}
