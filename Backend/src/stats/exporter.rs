//! Construcción y formateo del vector de estado.
//!
//! Igual que en Python, las filas se guardan "crudas" (valores tipados) y se
//! formatean bajo demanda: a JSON para la API (`format_row`) o a CSV
//! (`write_csv_row`). Mismo encabezado, mismo orden de columnas y mismas reglas
//! de formato (2 decimales para horas, 4 para el resto, vacío para `None`).

use std::borrow::Cow;
use std::fmt::Write as _;

use serde::ser::{Serialize, SerializeMap, Serializer};

use crate::core::simulation::DaySim;
use crate::core::state::ActiveVehicle;
use crate::stats::tracker::StatsTracker;

const HEADER_FIXED: [&str; 12] = [
    "Iteracion",
    "Dia",
    "Evento",
    "Reloj_min",
    // ── Llegada Auto
    "RND_Llegada_Auto",
    "Tiempo_Entre_Llegadas_Auto",
    "Prox_Llegada_Auto",
    // ── Llegada Camioneta
    "RND_Llegada_Camioneta",
    "Tiempo_Entre_Llegadas_Camioneta",
    "Prox_Llegada_Camioneta",
    // ── Colas
    "Cola_Autos",
    "Cola_Camionetas",
];

const HEADER_PER_LINE: [&str; 11] = [
    "RND_Frenos_L{i}",
    "Tiempo_Frenos_L{i}",
    "Estado_Frenos_L{i}",
    "Vehiculo_Frenos_L{i}",
    "Fin_Atencion_Frenos_L{i}",
    "Inicio_Bloqueo_L{i}",
    "RND_Luces_L{i}",
    "Tiempo_Luces_L{i}",
    "Estado_Luces_L{i}",
    "Vehiculo_Luces_L{i}",
    "Fin_Atencion_Luces_L{i}",
];

const HEADER_STATS: [&str; 10] = [
    "Cant_Autos_Atendidos",
    "Cant_Camionetas_Atendidas",
    "Acum_Global_Autos",
    "Acum_Global_Camionetas",
    "Tiempo_Espera_Auto",
    "Acum_Espera_Autos",
    "Acum_Global_Espera_Autos",
    "Tiempo_Espera_Camioneta",
    "Acum_Espera_Camionetas",
    "Acum_Global_Espera_Camionetas",
];

const HEADER_CLIENTES: &str = "Clientes_Activos";

/// Construye la lista completa de encabezados para N líneas.
pub fn build_header(num_lineas: usize) -> Vec<String> {
    let mut header: Vec<String> = HEADER_FIXED.iter().map(|s| s.to_string()).collect();
    for i in 1..=num_lineas {
        for col in HEADER_PER_LINE {
            header.push(col.replace("{i}", &i.to_string()));
        }
    }
    header.extend(HEADER_STATS.iter().map(|s| s.to_string()));
    for i in 1..=num_lineas {
        header.push(format!("Tiempo_Bloqueo_L{i}"));
        header.push(format!("Acum_Global_Bloqueo_Frenos_L{i}"));
    }
    header.push(HEADER_CLIENTES.to_string());
    header
}

/// Valor crudo de una celda del vector de estado.
#[derive(Debug, Clone, PartialEq)]
pub enum Cell {
    Null,
    Int(i64),
    Float(f64),
    Text(Cow<'static, str>),
    Clientes(Vec<ActiveVehicle>),
}

impl Cell {
    #[inline]
    fn opt(v: Option<f64>) -> Self {
        v.map_or(Cell::Null, Cell::Float)
    }
}

pub type Row = Vec<Cell>;

/// Acumulados globales al cierre del día anterior (Acum_Global_*).
#[derive(Debug, Clone, Default)]
pub struct DayOffsets {
    pub autos: u64,
    pub camionetas: u64,
    pub espera_autos: f64,
    pub espera_camionetas: f64,
    pub bloqueo: Vec<f64>,
}

impl DayOffsets {
    pub fn new(num_lineas: usize) -> Self {
        Self {
            bloqueo: vec![0.0; num_lineas],
            ..Default::default()
        }
    }

    /// Suma los totales de un día (en el mismo orden que Python).
    pub fn advance(&mut self, tracker: &StatsTracker) {
        self.autos += tracker.autos_atendidos;
        self.camionetas += tracker.camionetas_atendidas;
        self.espera_autos += tracker.total_espera_autos;
        self.espera_camionetas += tracker.total_espera_camionetas;
        for (i, b) in self.bloqueo.iter_mut().enumerate() {
            *b += tracker.acum_bloqueo_frenos(i as u32 + 1);
        }
    }
}

pub struct MemoryExporter {
    num_lineas: usize,
    pub headers: Vec<String>,
    /// Decimales por columna (2 para horas, 4 para el resto).
    decimals: Vec<usize>,
    iteracion: u64,
    dia: u64,
    offsets: DayOffsets,
    pub current_day_rows: Vec<Row>,
}

impl MemoryExporter {
    pub fn new(num_lineas: usize) -> Self {
        let headers = build_header(num_lineas);
        let decimals = headers
            .iter()
            .map(|h| {
                if h.contains("Reloj")
                    || h.contains("Prox")
                    || h.contains("Fin_Atencion")
                    || h.contains("Inicio_Bloqueo")
                {
                    2
                } else {
                    4
                }
            })
            .collect();
        Self {
            num_lineas,
            headers,
            decimals,
            iteracion: 0,
            dia: 0,
            offsets: DayOffsets::new(num_lineas),
            current_day_rows: Vec::new(),
        }
    }

    /// Copia del layout (encabezados/formato) sin filas.
    pub fn clone_layout(&self) -> Self {
        Self {
            num_lineas: self.num_lineas,
            headers: self.headers.clone(),
            decimals: self.decimals.clone(),
            iteracion: 0,
            dia: 0,
            offsets: DayOffsets::new(self.num_lineas),
            current_day_rows: Vec::new(),
        }
    }

    /// Prepara el exporter para recibir las filas del día indicado.
    pub fn start_day(&mut self, dia: u64, primera_iteracion: u64, offsets: DayOffsets) {
        self.dia = dia;
        self.iteracion = primera_iteracion;
        self.offsets = offsets;
        self.current_day_rows = Vec::with_capacity(256);
    }

    /// Serializa el vector de estado actual en formato crudo.
    pub fn write_row(&mut self, event_name: Cow<'static, str>, sim: &DaySim) {
        self.iteracion += 1;
        let st = &sim.state;
        let ctx = &sim.row_context;
        let off = &self.offsets;

        let mut row: Row = Vec::with_capacity(self.headers.len());
        row.push(Cell::Int(self.iteracion as i64));
        row.push(Cell::Int(self.dia as i64));
        row.push(Cell::Text(event_name));
        row.push(Cell::Float(st.clock));
        row.push(Cell::opt(ctx.rnd_llegada_auto));
        row.push(Cell::opt(ctx.tiempo_llegada_auto));
        row.push(Cell::opt(st.prox_llegada_auto));
        row.push(Cell::opt(ctx.rnd_llegada_camioneta));
        row.push(Cell::opt(ctx.tiempo_llegada_camioneta));
        row.push(Cell::opt(st.prox_llegada_camioneta));
        row.push(Cell::Int(st.entry_queue.count_autos() as i64));
        row.push(Cell::Int(st.entry_queue.count_camionetas() as i64));

        for (i, line) in st.lines.iter().enumerate() {
            let lc = &ctx.lines[i];
            let vf = line.frenos.current_vehicle.map(|id| st.vehicle(id));
            let vl = line.luces.current_vehicle;
            row.push(Cell::opt(lc.rnd_frenos));
            row.push(Cell::opt(lc.tiempo_frenos));
            row.push(Cell::Text(Cow::Borrowed(line.frenos.status_str())));
            row.push(vf.map_or(Cell::Null, |v| Cell::Int(v.id as i64)));
            row.push(Cell::opt(line.frenos.hora_fin_atencion));
            row.push(Cell::opt(vf.and_then(|v| v.hora_inicio_bloqueo)));
            row.push(Cell::opt(lc.rnd_luces));
            row.push(Cell::opt(lc.tiempo_luces));
            row.push(Cell::Text(Cow::Borrowed(line.luces.status_str())));
            row.push(vl.map_or(Cell::Null, |id| Cell::Int(id as i64)));
            row.push(Cell::opt(line.luces.hora_fin_atencion));
        }

        row.push(Cell::Int(st.count_autos_atendidos as i64));
        row.push(Cell::Int(st.count_camionetas_atendidas as i64));
        row.push(Cell::Int((off.autos + st.count_autos_atendidos) as i64));
        row.push(Cell::Int((off.camionetas + st.count_camionetas_atendidas) as i64));
        row.push(Cell::opt(ctx.tiempo_espera_auto));
        row.push(Cell::Float(st.total_espera_autos));
        row.push(Cell::Float(off.espera_autos + st.total_espera_autos));
        row.push(Cell::opt(ctx.tiempo_espera_camioneta));
        row.push(Cell::Float(st.total_espera_camionetas));
        row.push(Cell::Float(off.espera_camionetas + st.total_espera_camionetas));

        for i in 0..st.lines.len() {
            let lid = i as u32 + 1;
            row.push(Cell::opt(ctx.lines[i].tiempo_bloqueo));
            row.push(Cell::Float(
                off.bloqueo.get(i).copied().unwrap_or(0.0) + sim.tracker.acum_bloqueo_frenos(lid),
            ));
        }

        row.push(Cell::Clientes(st.snapshot_active_vehicles()));
        self.current_day_rows.push(row);
    }

    /// Vista serializable de una fila con el formato de la API (dict ordenado).
    pub fn format_row<'a>(&'a self, row: &'a Row) -> FormattedRow<'a> {
        FormattedRow {
            exporter: self,
            row,
        }
    }

    fn write_scalar(&self, col: usize, cell: &Cell, out: &mut String) {
        match cell {
            Cell::Null => {}
            Cell::Int(v) => {
                let _ = write!(out, "{v}");
            }
            Cell::Float(v) => {
                let _ = write!(out, "{:.*}", self.decimals[col], v);
            }
            Cell::Text(t) => out.push_str(t),
            Cell::Clientes(list) => write_clientes_json(list, out),
        }
    }

    pub fn write_csv_header(&self, out: &mut String) {
        for (i, h) in self.headers.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            push_csv_field(h, out);
        }
        out.push_str("\r\n");
    }

    /// Escribe una fila CSV (mismo formato que `csv.writer` de Python).
    pub fn write_csv_row(&self, row: &Row, out: &mut String) {
        let mut buf = String::with_capacity(64);
        for (i, cell) in row.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            buf.clear();
            self.write_scalar(i, cell, &mut buf);
            push_csv_field(&buf, out);
        }
        out.push_str("\r\n");
    }
}

/// Quoting mínimo de `csv.writer` (QUOTE_MINIMAL).
fn push_csv_field(field: &str, out: &mut String) {
    if field.contains([',', '"', '\r', '\n']) {
        out.push('"');
        out.push_str(&field.replace('"', "\"\""));
        out.push('"');
    } else {
        out.push_str(field);
    }
}

#[inline]
fn write_py_float(v: f64, out: &mut String) {
    // `{:?}` produce la representación más corta que preserva el valor, como
    // `repr(float)` en Python (p. ej. 488.0, 512.37).
    let _ = write!(out, "{v:?}");
}

/// Igual que `json.dumps(clientes, ensure_ascii=False)` (vacío si no hay clientes).
fn write_clientes_json(list: &[ActiveVehicle], out: &mut String) {
    if list.is_empty() {
        return;
    }
    out.push('[');
    for (i, v) in list.iter().enumerate() {
        if i > 0 {
            out.push_str(", ");
        }
        let _ = write!(
            out,
            "{{\"id\": {}, \"tipo\": \"{}\", \"estado\": \"{}\", \"linea\": ",
            v.id, v.tipo, v.estado
        );
        match v.linea {
            Some(l) => {
                let _ = write!(out, "{l}");
            }
            None => out.push_str("null"),
        }
        out.push_str(", \"hora_llegada\": ");
        write_py_float(v.hora_llegada, out);
        out.push_str(", \"hora_inicio_bloqueo\": ");
        match v.hora_inicio_bloqueo {
            Some(h) => write_py_float(h, out),
            None => out.push_str("null"),
        }
        out.push('}');
    }
    out.push(']');
}

pub struct FormattedRow<'a> {
    exporter: &'a MemoryExporter,
    row: &'a Row,
}

impl Serialize for FormattedRow<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let exp = self.exporter;
        let mut map = serializer.serialize_map(Some(self.row.len()))?;
        let mut buf = String::with_capacity(32);
        for (i, (h, cell)) in exp.headers.iter().zip(self.row.iter()).enumerate() {
            match cell {
                Cell::Clientes(list) => map.serialize_entry(h, list)?,
                other => {
                    buf.clear();
                    exp.write_scalar(i, other, &mut buf);
                    map.serialize_entry(h, &buf)?;
                }
            }
        }
        map.end()
    }
}
