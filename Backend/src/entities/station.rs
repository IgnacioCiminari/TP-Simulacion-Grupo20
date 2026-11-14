//! Estación de servicio (Frenos o Luces) dentro de una línea de inspección.

use crate::entities::vehicle::VehicleId;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StationType {
    Frenos,
    Luces,
}

impl StationType {
    pub fn value(self) -> &'static str {
        match self {
            StationType::Frenos => "Frenos",
            StationType::Luces => "Luces",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StationStatus {
    Libre,
    Ocupado,
    Bloqueado,
}

impl StationStatus {
    pub fn value(self) -> &'static str {
        match self {
            StationStatus::Libre => "Libre",
            StationStatus::Ocupado => "Ocupado",
            StationStatus::Bloqueado => "Bloqueado",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Station {
    pub tipo: StationType,
    pub line_id: u32,
    pub status: StationStatus,
    pub current_vehicle: Option<VehicleId>,
    pub hora_fin_atencion: Option<f64>,

    // Acumuladores para estadísticas
    total_busy_time: f64,
    total_blocked_time: f64,
    block_start: Option<f64>,
    pub busy_start: Option<f64>,
}

impl Station {
    pub fn new(tipo: StationType, line_id: u32) -> Self {
        Self {
            tipo,
            line_id,
            status: StationStatus::Libre,
            current_vehicle: None,
            hora_fin_atencion: None,
            total_busy_time: 0.0,
            total_blocked_time: 0.0,
            block_start: None,
            busy_start: None,
        }
    }

    // ── Consultas de estado ────────────────────────────────────────────────

    #[inline]
    pub fn is_free(&self) -> bool {
        self.status == StationStatus::Libre
    }

    #[inline]
    pub fn is_busy(&self) -> bool {
        self.status == StationStatus::Ocupado
    }

    #[inline]
    pub fn is_blocked(&self) -> bool {
        self.status == StationStatus::Bloqueado
    }

    #[inline]
    pub fn status_str(&self) -> &'static str {
        self.status.value()
    }

    // ── Transiciones de estado ─────────────────────────────────────────────

    /// Inicia la atención de un vehículo en esta estación.
    pub fn start_service(&mut self, vehicle: VehicleId, clock: f64, fin: f64) {
        self.current_vehicle = Some(vehicle);
        self.status = StationStatus::Ocupado;
        self.hora_fin_atencion = Some(fin);
        self.busy_start = Some(clock);
    }

    /// Finaliza la atención, acumula el tiempo de uso y devuelve el vehículo.
    pub fn finish_service(&mut self, clock: f64) -> VehicleId {
        let vehicle = self
            .current_vehicle
            .expect("No hay vehículo siendo atendido.");
        if let Some(start) = self.busy_start.take() {
            self.total_busy_time += clock - start;
        }
        self.current_vehicle = None;
        self.hora_fin_atencion = None;
        vehicle
    }

    /// Bloquea la estación (el vehículo terminó Frenos pero Luces está ocupado).
    pub fn set_blocked(&mut self, clock: f64) {
        self.status = StationStatus::Bloqueado;
        self.block_start = Some(clock);
        if let Some(start) = self.busy_start.take() {
            self.total_busy_time += clock - start;
        }
    }

    /// Desbloquea la estación, acumula el tiempo de bloqueo y devuelve el vehículo.
    pub fn unblock(&mut self, clock: f64) -> VehicleId {
        let vehicle = self.current_vehicle.expect("No hay vehículo bloqueado.");
        if let Some(start) = self.block_start.take() {
            self.total_blocked_time += clock - start;
        }
        self.current_vehicle = None;
        self.status = StationStatus::Libre;
        self.hora_fin_atencion = None;
        vehicle
    }

    /// Libera la estación sin vehículo.
    pub fn set_free(&mut self) {
        self.current_vehicle = None;
        self.status = StationStatus::Libre;
        self.hora_fin_atencion = None;
        self.busy_start = None;
    }

    // ── Estadísticas ───────────────────────────────────────────────────────

    pub fn total_busy_time(&self) -> f64 {
        self.total_busy_time
    }

    pub fn total_blocked_time(&self) -> f64 {
        self.total_blocked_time
    }
}
