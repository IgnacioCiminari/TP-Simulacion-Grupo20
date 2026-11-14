//! FEL (Future Event List): heap de mínimos ordenado por `(timestamp, orden de inserción)`.
//!
//! El contador de inserción garantiza estabilidad FIFO entre eventos del mismo
//! instante, exactamente igual que el `heapq` de la versión en Python.

use std::cmp::Ordering;
use std::collections::BinaryHeap;

use crate::core::event::{Event, EventKind};

struct Entry {
    timestamp: f64,
    seq: u64,
    event: Event,
}

impl PartialEq for Entry {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for Entry {}

impl PartialOrd for Entry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Entry {
    // `BinaryHeap` es un heap de máximos: se invierte la comparación para
    // obtener un heap de mínimos sobre (timestamp, seq).
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .timestamp
            .total_cmp(&self.timestamp)
            .then_with(|| other.seq.cmp(&self.seq))
    }
}

#[derive(Default)]
pub struct EventQueue {
    heap: BinaryHeap<Entry>,
    counter: u64,
}

impl EventQueue {
    pub fn new() -> Self {
        Self {
            heap: BinaryHeap::with_capacity(16),
            counter: 0,
        }
    }

    #[inline]
    pub fn push(&mut self, event: Event) {
        self.heap.push(Entry {
            timestamp: event.timestamp,
            seq: self.counter,
            event,
        });
        self.counter += 1;
    }

    #[inline]
    pub fn pop(&mut self) -> Option<Event> {
        self.heap.pop().map(|e| e.event)
    }

    pub fn peek(&self) -> Option<&Event> {
        self.heap.peek().map(|e| &e.event)
    }

    /// Elimina todos los eventos que cumplan el predicado sobre su tipo.
    /// Devuelve la cantidad de eventos eliminados.
    pub fn remove_by_kind<F: Fn(&EventKind) -> bool>(&mut self, pred: F) -> usize {
        let before = self.heap.len();
        self.heap.retain(|e| !pred(&e.event.kind));
        before - self.heap.len()
    }

    pub fn len(&self) -> usize {
        self.heap.len()
    }

    pub fn is_empty(&self) -> bool {
        self.heap.is_empty()
    }
}
