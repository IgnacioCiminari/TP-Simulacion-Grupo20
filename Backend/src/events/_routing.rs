//! Lógica de ruteo compartida por LlegadaAuto y LlegadaCamioneta.

use crate::core::event::{Event, EventKind};
use crate::core::simulation::DaySim;
use crate::entities::vehicle::{VehicleId, VehicleState};

/// Intenta asignar el vehículo a una estación de Frenos libre (agenda su
/// `FinRevisionFrenos`). Si no hay ninguna, lo encola con prioridad.
pub fn route_vehicle_to_frenos(sim: &mut DaySim, vid: VehicleId) {
    match sim.state.get_free_brake_line() {
        Some(idx) => {
            // El vehículo entra directamente a la estación de Frenos.
            let line_id = sim.state.lines[idx].id;
            let tiempo_frenos = sim.sample_tiempo_frenos(line_id);
            let clock = sim.state.clock;
            let fin = clock + tiempo_frenos;

            let v = sim.state.vehicle_mut(vid);
            v.hora_inicio_servicio = Some(clock);
            v.linea_asignada = Some(line_id);
            v.estado = VehicleState::EnFrenos;

            sim.state.lines[idx].frenos.start_service(vid, clock, fin);
            sim.schedule(Event::new(fin, EventKind::FinRevisionFrenos { line_id }));
        }
        None => {
            // Va a la cola de ingreso
            let v = sim.state.vehicle_mut(vid);
            v.estado = VehicleState::Esperando;
            let tipo = v.tipo;
            sim.state.entry_queue.enqueue(vid, tipo);
        }
    }
}
