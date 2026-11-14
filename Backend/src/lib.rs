//! Simulación de eventos discretos (DES) de la Planta de Revisión Técnica Vehicular.
//!
//! Organización de módulos (idéntica al backend en Python de `Api/`):
//!   - `core`     → motor DES: eventos, FEL, RNG, estado y bucle de simulación.
//!   - `entities` → vehículos, estaciones, líneas y cola con prioridad.
//!   - `events`   → lógica de transición de cada tipo de evento.
//!   - `stats`    → métricas por día / globales y exportación del vector de estado.
//!   - `api`      → API HTTP (mismos endpoints y formato JSON que `Api/api.py`).
//!
//! Nota: dentro del crate siempre se referencia el motor como `crate::core`
//! para no confundirlo con la librería estándar `core`.

/// mimalloc como allocator global: con musl (imagen alpine) el malloc por
/// defecto es varias veces más lento y no escala con varios hilos.
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

pub mod api;
pub mod core;
pub mod entities;
pub mod events;
pub mod stats;
