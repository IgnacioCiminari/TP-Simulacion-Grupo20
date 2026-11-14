//! Tests unitarios de la cola con prioridad: las camionetas siempre se
//! despachan antes que los autos, independientemente del orden de llegada.

use rtv_backend::entities::queue::PriorityVehicleQueue;
use rtv_backend::entities::vehicle::VehicleType::{Auto, Camioneta};

#[test]
fn camioneta_priority_over_auto() {
    let mut q = PriorityVehicleQueue::new();
    q.enqueue(1, Auto);
    q.enqueue(2, Camioneta);
    assert_eq!(q.dequeue(), Some(2), "La camioneta debe salir antes que el auto.");
}

#[test]
fn fifo_among_camionetas() {
    let mut q = PriorityVehicleQueue::new();
    q.enqueue(1, Camioneta);
    q.enqueue(2, Camioneta);
    assert_eq!(q.dequeue(), Some(1));
    assert_eq!(q.dequeue(), Some(2));
}

#[test]
fn fifo_among_autos() {
    let mut q = PriorityVehicleQueue::new();
    q.enqueue(1, Auto);
    q.enqueue(2, Auto);
    assert_eq!(q.dequeue(), Some(1));
    assert_eq!(q.dequeue(), Some(2));
}

#[test]
fn dequeue_empty_returns_none() {
    let mut q = PriorityVehicleQueue::new();
    assert_eq!(q.dequeue(), None);
}

#[test]
fn count_methods() {
    let mut q = PriorityVehicleQueue::new();
    q.enqueue(1, Auto);
    q.enqueue(2, Auto);
    q.enqueue(3, Camioneta);
    assert_eq!(q.count_autos(), 2);
    assert_eq!(q.count_camionetas(), 1);
    assert_eq!(q.len(), 3);
}

#[test]
fn empty_and_non_empty() {
    let mut q = PriorityVehicleQueue::new();
    assert!(q.is_empty());
    q.enqueue(1, Auto);
    assert!(!q.is_empty());
}

#[test]
fn all_camionetas_before_any_auto() {
    let mut q = PriorityVehicleQueue::new();
    q.enqueue(1, Auto);
    q.enqueue(2, Camioneta);
    q.enqueue(3, Auto);
    q.enqueue(4, Camioneta);
    let salidas: Vec<_> = (0..4).map(|_| q.dequeue().unwrap()).collect();
    assert_eq!(salidas, vec![2, 4, 1, 3]);
}
