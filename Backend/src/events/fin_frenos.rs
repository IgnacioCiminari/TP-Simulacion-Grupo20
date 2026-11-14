//! Evento: un vehículo termina su revisión en la estación de Frenos.
//!
//! Posibles transiciones:
//! 1. Luces libre → el vehículo pasa a Luces (se agenda FinRevisionLuces).
//!    Frenos queda libre y toma el siguiente de la cola si hay alguno.
//! 2. Luces ocupado → Frenos queda BLOQUEADO con el vehículo adentro hasta que
//!    Luces se libere (FinRevisionLuces lo desbloquea).

use crate::core::event::{Event, EventKind};
use crate::core::simulation::DaySim;
use crate::entities::vehicle::{VehicleState, VehicleType};

pub fn process(sim: &mut DaySim, line_id: u32) {
    let idx = (line_id - 1) as usize;
    let clock = sim.state.clock;

    // Registrar el tiempo real de servicio en frenos antes de finish_service
    if let Some(vid) = sim.state.lines[idx].frenos.current_vehicle {
        if let Some(inicio) = sim.state.vehicle(vid).hora_inicio_servicio {
            sim.tracker.register_servicio_frenos(line_id, clock - inicio);
        }
    }

    let vid = sim.state.lines[idx].frenos.finish_service(clock);

    if sim.state.lines[idx].luces.is_free() {
        // --- Camino 1: Luces libre → transferir vehículo ---
        let tiempo_luces = sim.sample_tiempo_luces(line_id);
        let fin_luces = clock + tiempo_luces;

        sim.state.vehicle_mut(vid).estado = VehicleState::EnLuces;
        sim.state.lines[idx].luces.start_service(vid, clock, fin_luces);
        sim.schedule(Event::new(fin_luces, EventKind::FinRevisionLuces { line_id }));

        // Frenos queda libre → tomar siguiente de la cola
        dequeue_to_frenos(sim, idx);
    } else {
        // --- Camino 2: Luces ocupado → bloquear Frenos ---
        let v = sim.state.vehicle_mut(vid);
        v.estado = VehicleState::BloqueadoEnFrenos;
        v.hora_inicio_bloqueo = Some(clock);
        let frenos = &mut sim.state.lines[idx].frenos;
        frenos.current_vehicle = Some(vid);
        frenos.set_blocked(clock);
    }
}

/// Toma el siguiente vehículo de la cola de entrada y lo envía a la estación de
/// Frenos de la línea `idx`. Si la cola está vacía, Frenos queda libre.
pub fn dequeue_to_frenos(sim: &mut DaySim, idx: usize) {
    let clock = sim.state.clock;
    let Some(nid) = sim.state.entry_queue.dequeue() else {
        sim.state.lines[idx].frenos.set_free();
        return;
    };

    // Registrar el tiempo de espera en cola y marcarlo como ya contabilizado
    // (FinRevisionLuces lo saltea al verificar `already_counted`).
    let v = sim.state.vehicle(nid);
    let wait_time = clock - v.hora_inicio_espera;
    match v.tipo {
        VehicleType::Auto => {
            sim.state.total_espera_autos += wait_time;
            sim.state.count_autos_atendidos += 1;
            sim.row_context.tiempo_espera_auto = Some(wait_time);
        }
        VehicleType::Camioneta => {
            sim.state.total_espera_camionetas += wait_time;
            sim.state.count_camionetas_atendidas += 1;
            sim.row_context.tiempo_espera_camioneta = Some(wait_time);
        }
    }

    // Enviar el vehículo a Frenos.
    let line_id = sim.state.lines[idx].id;
    let tiempo_frenos = sim.sample_tiempo_frenos(line_id);
    let fin = clock + tiempo_frenos;

    let v = sim.state.vehicle_mut(nid);
    v.already_counted = true;
    v.hora_inicio_servicio = Some(clock);
    v.linea_asignada = Some(line_id);
    v.estado = VehicleState::EnFrenos;

    sim.state.lines[idx].frenos.start_service(nid, clock, fin);
    sim.schedule(Event::new(fin, EventKind::FinRevisionFrenos { line_id }));
}
