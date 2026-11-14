//! Vehículo que ingresa al sistema de revisión técnica.

pub type VehicleId = u32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VehicleType {
    Auto,
    Camioneta,
}

impl VehicleType {
    pub fn value(self) -> &'static str {
        match self {
            VehicleType::Auto => "Auto",
            VehicleType::Camioneta => "Camioneta",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VehicleState {
    Esperando,
    EnFrenos,
    BloqueadoEnFrenos,
    EnLuces,
    Retirado,
}

impl VehicleState {
    pub fn value(self) -> &'static str {
        match self {
            VehicleState::Esperando => "Esperando",
            VehicleState::EnFrenos => "En Frenos",
            VehicleState::BloqueadoEnFrenos => "Bloqueado en Frenos",
            VehicleState::EnLuces => "En Luces",
            VehicleState::Retirado => "Retirado",
        }
    }
}

/// Atributos:
///   - `id`: identificador único secuencial.
///   - `linea_asignada`: línea de inspección asignada (`None` si está en cola).
///   - `hora_inicio_espera`: minuto en que entró a la cola.
///   - `hora_inicio_servicio`: minuto en que comenzó a ser atendido en Frenos.
///   - `hora_inicio_bloqueo`: minuto en que Frenos quedó bloqueado con este vehículo.
///   - `already_counted`: evita el doble conteo de estadísticas si pasó por la cola.
#[derive(Debug, Clone)]
pub struct Vehicle {
    pub id: VehicleId,
    pub tipo: VehicleType,
    pub estado: VehicleState,
    pub linea_asignada: Option<u32>,
    pub hora_llegada: f64,
    pub hora_inicio_espera: f64,
    pub hora_inicio_servicio: Option<f64>,
    pub hora_inicio_bloqueo: Option<f64>,
    pub already_counted: bool,
}

impl Vehicle {
    pub fn new(id: VehicleId, tipo: VehicleType, hora_llegada: f64) -> Self {
        Self {
            id,
            tipo,
            estado: VehicleState::Esperando,
            linea_asignada: None,
            hora_llegada,
            hora_inicio_espera: hora_llegada,
            hora_inicio_servicio: None,
            hora_inicio_bloqueo: None,
            already_counted: false,
        }
    }

    /// Tiempo que esperó en la cola antes de ser atendido (0 si entró directo).
    pub fn tiempo_espera_en_cola(&self) -> f64 {
        match self.hora_inicio_servicio {
            None => 0.0,
            Some(inicio) => (inicio - self.hora_inicio_espera).max(0.0),
        }
    }
}
