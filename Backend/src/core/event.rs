//! Definición de los eventos de la simulación.
//!
//! En Python cada evento es una subclase de `Event` (ABC) con `process()`.
//! En Rust los eventos son un `enum` liviano (`Copy`, sin asignaciones en el heap)
//! y `process()` despacha a la función del módulo `events::*` correspondiente.
//!
//! A diferencia de Python, `process()` no devuelve una lista de eventos nuevos:
//! cada evento los agenda directamente en la FEL (en el mismo orden en que Python
//! los devolvía), evitando una asignación por evento. El desempate FIFO de la FEL
//! queda idéntico.

use std::borrow::Cow;

use crate::core::simulation::DaySim;
use crate::events::{cierre_puertas, fin_frenos, fin_luces, llegada_auto, llegada_camioneta};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventKind {
    LlegadaAuto,
    LlegadaCamioneta,
    CierrePuertas,
    FinRevisionFrenos { line_id: u32 },
    FinRevisionLuces { line_id: u32 },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Event {
    /// Instante del reloj de simulación en que debe procesarse el evento.
    pub timestamp: f64,
    pub kind: EventKind,
}

impl Event {
    #[inline]
    pub fn new(timestamp: f64, kind: EventKind) -> Self {
        Self { timestamp, kind }
    }

    /// Procesa el evento aplicando la transición de estado correspondiente.
    #[inline]
    pub fn process(&self, sim: &mut DaySim) {
        match self.kind {
            EventKind::LlegadaAuto => llegada_auto::process(sim),
            EventKind::LlegadaCamioneta => llegada_camioneta::process(sim),
            EventKind::CierrePuertas => cierre_puertas::process(sim),
            EventKind::FinRevisionFrenos { line_id } => fin_frenos::process(sim, line_id),
            EventKind::FinRevisionLuces { line_id } => fin_luces::process(sim, line_id),
        }
    }

    /// Nombre descriptivo del evento para registrar en el vector de estado.
    pub fn nombre(&self) -> Cow<'static, str> {
        match self.kind {
            EventKind::LlegadaAuto => Cow::Borrowed(llegada_auto::NOMBRE),
            EventKind::LlegadaCamioneta => Cow::Borrowed(llegada_camioneta::NOMBRE),
            EventKind::CierrePuertas => Cow::Borrowed(cierre_puertas::NOMBRE),
            EventKind::FinRevisionFrenos { line_id } => {
                Cow::Owned(format!("Fin Revisión Frenos L{line_id}"))
            }
            EventKind::FinRevisionLuces { line_id } => {
                Cow::Owned(format!("Fin Revisión Luces L{line_id}"))
            }
        }
    }
}
