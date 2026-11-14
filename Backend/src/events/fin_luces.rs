//! Evento: un vehículo termina su revisión en la estación de Luces.
//!
//! 1. El vehículo sale del sistema; se contabiliza su espera si no se hizo antes
//!    (vehículos que entraron directo a Frenos, sin cola).
//! 2. Si Frenos de la misma línea estaba BLOQUEADO: se desbloquea, el vehículo
//!    bloqueado pasa a Luces y Frenos toma el siguiente de la cola.
//! 3. Si no, Luces queda libre.

use crate::core::event::{Event, EventKind};
use crate::core::simulation::DaySim;
use crate::entities::vehicle::{VehicleState, VehicleType};
use crate::events::fin_frenos::dequeue_to_frenos;

pub fn process(sim: &mut DaySim, line_id: u32) {
    let idx = (line_id - 1) as usize;
    let clock = sim.state.clock;

    // Registrar tiempo real de servicio en Luces antes de finish_service
    if let Some(inicio) = sim.state.lines[idx].luces.busy_start {
        sim.tracker.register_servicio_luces(line_id, clock - inicio);
    }

    // El vehículo sale del sistema
    let exiting = sim.state.lines[idx].luces.finish_service(clock);
    sim.state.vehicle_mut(exiting).estado = VehicleState::Retirado;
    sim.state.track_vehicle_exit();

    // Contabilizar atendidos (la espera es 0 si entró directo a Frenos).
    let v = sim.state.vehicle(exiting);
    if !v.already_counted {
        let wait = v.tiempo_espera_en_cola();
        match v.tipo {
            VehicleType::Auto => {
                sim.state.total_espera_autos += wait;
                sim.state.count_autos_atendidos += 1;
                sim.row_context.tiempo_espera_auto = Some(wait);
            }
            VehicleType::Camioneta => {
                sim.state.total_espera_camionetas += wait;
                sim.state.count_camionetas_atendidas += 1;
                sim.row_context.tiempo_espera_camioneta = Some(wait);
            }
        }
    }

    sim.state.lines[idx].luces.set_free();

    // Verificar si Frenos estaba bloqueado en esta línea
    if sim.state.lines[idx].frenos.is_blocked() {
        let blocked = sim.state.lines[idx].frenos.unblock(clock);

        // Acumular tiempo de bloqueo y registrarlo en el contexto
        if let Some(inicio) = sim.state.vehicle(blocked).hora_inicio_bloqueo {
            let bloqueo = clock - inicio;
            sim.tracker.register_bloqueo_frenos(line_id, bloqueo);
            sim.row_context.lines[idx].tiempo_bloqueo = Some(bloqueo);
        }

        // Mover el vehículo bloqueado a Luces
        let tiempo_luces = sim.sample_tiempo_luces(line_id);
        let fin_luces = clock + tiempo_luces;

        let v = sim.state.vehicle_mut(blocked);
        v.estado = VehicleState::EnLuces;
        v.hora_inicio_bloqueo = None;
        sim.state.lines[idx].luces.start_service(blocked, clock, fin_luces);
        sim.schedule(Event::new(fin_luces, EventKind::FinRevisionLuces { line_id }));

        // Frenos queda libre: intentar tomar el siguiente de la cola
        dequeue_to_frenos(sim, idx);
    }
}
