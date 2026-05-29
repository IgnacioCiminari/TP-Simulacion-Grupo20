import { useState, useEffect, useCallback, useMemo } from "react";
import { useSimulation } from "../context/SimulationContext";
import simulationService from "../services/simulation.service";
import { toast } from "sonner";
import { Clock, Car, Truck, SlidersHorizontal, Search, Download, AlarmClock } from "lucide-react";
import { ChevronDown, ChevronRight } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de tiempo
// ─────────────────────────────────────────────────────────────────────────────

const TIME_COLS = new Set([
    "Reloj_min",
    "Prox_Llegada_Auto",
    "Prox_Llegada_Camioneta",
    "Fin_Atencion_Frenos",
    "Fin_Atencion_Luces",
]);

function isTimeCol(key) {
    if (TIME_COLS.has(key)) return true;
    // Detectar dinámicamente columnas de fin de atención por línea
    return /^Fin_Atencion_(Frenos|Luces)_L\d+$/.test(key);
}

function minToHHMMSS(val) {
    if (val == null || val === "" || isNaN(parseFloat(val))) return val;
    const totalSec = parseFloat(val) * 60;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    const cs = Math.round((totalSec % 1) * 100);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(cs).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsear claves del backend en grupos de cabeceras dinámicos
// (soporta N líneas automáticamente)
// ─────────────────────────────────────────────────────────────────────────────

function buildColumnGroups(sampleKeys) {
    if (!sampleKeys || sampleKeys.length === 0) return [];

    // Detectar cuántas líneas hay
    const lineIds = [...new Set(
        sampleKeys
            .map(k => { const m = k.match(/_L(\d+)$/); return m ? parseInt(m[1]) : null; })
            .filter(Boolean)
    )].sort((a, b) => a - b);

    const groups = [
        { id: "base", label: "Base", fixed: true, keys: ["Iteracion", "Dia", "Evento", "Reloj_min"] },
        {
            id: "llegada_auto", label: "Llegada Auto",
            keys: ["RND_Llegada_Auto", "Tiempo_Entre_Llegadas_Auto", "Prox_Llegada_Auto"],
        },
        {
            id: "llegada_camioneta", label: "Llegada Camioneta",
            keys: ["RND_Llegada_Camioneta", "Tiempo_Entre_Llegadas_Camioneta", "Prox_Llegada_Camioneta"],
        },
        { id: "colas", label: "Colas", keys: ["Cola_Autos", "Cola_Camionetas"] },
    ];

    // Un grupo por línea (frenos + luces)
    for (const lid of lineIds) {
        groups.push({
            id: `linea_${lid}`,
            label: `Línea ${lid}`,
            keys: [
                `RND_Frenos_L${lid}`,
                `Tiempo_Frenos_L${lid}`,
                `Estado_Frenos_L${lid}`,
                `Vehiculo_Frenos_L${lid}`,
                `Fin_Atencion_Frenos_L${lid}`,
                `RND_Luces_L${lid}`,
                `Tiempo_Luces_L${lid}`,
                `Estado_Luces_L${lid}`,
                `Vehiculo_Luces_L${lid}`,
                `Fin_Atencion_Luces_L${lid}`,
            ],
        });
    }

    groups.push(
        {
            id: "stats_atendidos", label: "Atendidos",
            keys: ["Cant_Autos_Atendidos", "Cant_Camionetas_Atendidas"],
        },
        {
            id: "stats_espera", label: "Tiempos de Espera",
            keys: ["Tiempo_Espera_Auto", "Acum_Espera_Autos", "Tiempo_Espera_Camioneta", "Acum_Espera_Camionetas"],
        },
    );

    // Bloqueo por línea
    for (const lid of lineIds) {
        groups.push({
            id: `bloqueo_${lid}`,
            label: `Bloqueo L${lid}`,
            keys: [`Tiempo_Bloqueo_L${lid}`, `Acum_Bloqueo_Frenos_L${lid}`],
        });
    }

    groups.push({ id: "clientes_activos", label: "Clientes Activos", keys: ["Clientes_Activos"] });

    return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-headers: mapeo de clave a etiqueta corta para la 2ª fila del header
// ─────────────────────────────────────────────────────────────────────────────

const SHORT_LABELS = {
    Iteracion: "ID",
    Dia: "Día",
    Evento: "Evento",
    Reloj_min: "Reloj",
    RND_Llegada_Auto: "RND",
    Tiempo_Entre_Llegadas_Auto: "Tiempo",
    Prox_Llegada_Auto: "Próx.",
    RND_Llegada_Camioneta: "RND",
    Tiempo_Entre_Llegadas_Camioneta: "Tiempo",
    Prox_Llegada_Camioneta: "Próx.",
    Cola_Autos: "Autos",
    Cola_Camionetas: "Camionetas",
    Cant_Autos_Atendidos: "Autos",
    Cant_Camionetas_Atendidas: "Camionetas",
    Tiempo_Espera_Auto: "T. Espera",
    Acum_Espera_Autos: "Acum.",
    Tiempo_Espera_Camioneta: "T. Espera",
    Acum_Espera_Camionetas: "Acum.",
    Clientes_Activos: "Clientes",
};

function getShortLabel(key) {
    if (SHORT_LABELS[key]) return SHORT_LABELS[key];
    // RND_Frenos_L1 → RND, Tiempo_Frenos_L1 → Tiempo, etc.
    if (/^RND_/.test(key)) return "RND";
    if (/^Tiempo_Frenos_/.test(key)) return "T. Frenos";
    if (/^Tiempo_Luces_/.test(key)) return "T. Luces";
    if (/^Tiempo_Bloqueo_/.test(key)) return "T. Bloqueo";
    if (/^Acum_Bloqueo_/.test(key)) return "Acum.";
    if (/^Estado_Frenos_/.test(key)) return "Est. Frenos";
    if (/^Estado_Luces_/.test(key)) return "Est. Luces";
    if (/^Vehiculo_Frenos_/.test(key)) return "Veh. Frenos";
    if (/^Vehiculo_Luces_/.test(key)) return "Veh. Luces";
    if (/^Fin_Atencion_Frenos_/.test(key)) return "Fin Frenos";
    if (/^Fin_Atencion_Luces_/.test(key)) return "Fin Luces";
    return key.replace(/_/g, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Colores de badges de clientes
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_COLORS = {
    Auto: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    Camioneta: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

const ESTADO_COLORS = {
    En_Frenos: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    En_Luces: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    En_Cola: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

function ClienteBadge({ cliente }) {
    const color = CLIENT_COLORS[cliente.tipo] || CLIENT_COLORS.Auto;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
            #{cliente.id} {cliente.tipo === "Camioneta" ? "🚐" : "🚗"}
        </span>
    );
}

function ClientesCell({ clientes }) {
    const [expanded, setExpanded] = useState(false);
    if (!Array.isArray(clientes) || clientes.length === 0) return <span className="text-zinc-400">—</span>;

    return (
        <div>
            <button
                onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
                className="flex items-center gap-1 text-xs"
            >
                <span className="flex flex-wrap gap-0.5">
                    {clientes.slice(0, 3).map(c => <ClienteBadge key={c.id} cliente={c} />)}
                    {clientes.length > 3 && <span className="text-zinc-400">+{clientes.length - 3}</span>}
                </span>
                {expanded ? <ChevronDown className="h-3 w-3 text-zinc-400" /> : <ChevronRight className="h-3 w-3 text-zinc-400" />}
            </button>
            {expanded && (
                <div className="mt-1.5 space-y-1">
                    {clientes.map(c => (
                        <div key={c.id} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-zinc-50 px-2 py-1 dark:bg-zinc-800/50 text-xs">
                            <ClienteBadge cliente={c} />
                            <span className={`rounded-full px-1.5 py-0.5 font-medium ${ESTADO_COLORS[c.estado] || ""}`}>{c.estado}</span>
                            {c.linea && <span className="text-zinc-400">L{c.linea}</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats Card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value ?? "—"}</p>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Celda con formato condicional
// ─────────────────────────────────────────────────────────────────────────────

function CellValue({ colKey, value, timeMode }) {
    if (value == null || value === "") return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
    if (colKey === "Clientes_Activos") return <ClientesCell clientes={value} />;
    if (timeMode && isTimeCol(colKey)) return <span>{minToHHMMSS(value)}</span>;
    return <span>{value}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fila de datos
// ─────────────────────────────────────────────────────────────────────────────

function DataRow({ record, visibleKeys, timeMode, isSticky = false }) {
    const base = isSticky
        ? "border-t-2 border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/80 font-medium sticky bottom-0 z-10"
        : "border-b border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-800 dark:hover:bg-zinc-800/40 transition-colors";

    return (
        <tr className={base}>
            {visibleKeys.map(key => (
                <td key={key} className="whitespace-nowrap px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <CellValue colKey={key} value={record[key]} timeMode={timeMode} />
                </td>
            ))}
        </tr>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal: Table
// ─────────────────────────────────────────────────────────────────────────────

export default function Table() {
    const { simulationResult, totalDias, setTotalDias, lastRow, setLastRow } = useSimulation();
    const [dayInput, setDayInput] = useState(1);
    const [data, setData] = useState(simulationResult || null);
    const [loading, setLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const [limit] = useState(50);
    const [timeMode, setTimeMode] = useState(false); // false = Minutos, true = HH:MM:SS

    // Columnas dinámicas, derivadas del primer registro disponible
    const sampleRecord = data?.records?.[0] || lastRow || null;
    const allKeys = useMemo(
        () => sampleRecord ? Object.keys(sampleRecord) : [],
        [sampleRecord]
    );

    const columnGroups = useMemo(() => buildColumnGroups(allKeys), [allKeys]);

    const [visibleGroups, setVisibleGroups] = useState(null);
    const [showColumnMenu, setShowColumnMenu] = useState(false);

    // Inicializar visibleGroups cuando los columnGroups estén disponibles
    useEffect(() => {
        if (columnGroups.length > 0 && visibleGroups === null) {
            setVisibleGroups(columnGroups.reduce((acc, g) => ({ ...acc, [g.id]: true }), {}));
        }
    }, [columnGroups]);

    const visibleGroupsResolved = visibleGroups || {};

    const visibleKeys = useMemo(
        () => columnGroups
            .filter(g => visibleGroupsResolved[g.id] !== false)
            .flatMap(g => g.keys)
            .filter(k => allKeys.includes(k)),
        [columnGroups, visibleGroupsResolved, allKeys]
    );

    const clampDia = (val) => {
        const n = parseInt(val, 10);
        if (isNaN(n)) return 1;
        return Math.min(Math.max(n, 1), totalDias || Infinity);
    };

    const fetchDay = useCallback(async (dia, off) => {
        setLoading(true);
        try {
            const result = await simulationService.getDayRecords(dia, off, limit);
            setData(result);
            if (result.total_dias_simulados) setTotalDias(result.total_dias_simulados);
        } catch (err) {
            const raw = err?.response?.data?.detail || "";
            let friendly = "Error al consultar el día.";
            if (raw.includes("no existe")) {
                friendly = `Día ${dia} no encontrado en la simulación activa.`;
            } else if (raw.includes("No hay ninguna simulación")) {
                friendly = "No hay ninguna simulación activa. Ejecutá una desde Configuración.";
            }
            toast.error("Día no encontrado", { description: friendly });
        } finally {
            setLoading(false);
        }
    }, [limit, totalDias]);

    // Al montar: si hay resultado del POST úsalo, sino pide el día 1
    useEffect(() => {
        if (simulationResult) {
            setData(simulationResult);
        } else {
            fetchDay(1, 0);
            // También intentar obtener el último registro si no está en contexto
            if (!lastRow) {
                simulationService.getUltimoRegistro()
                    .then(r => setLastRow(r.ultimo_registro))
                    .catch(() => {});
            }
        }
    }, []);

    const handleDaySearch = (e) => {
        e.preventDefault();
        const dia = clampDia(dayInput);
        setDayInput(dia);
        setOffset(0);
        fetchDay(dia, 0);
    };

    const handlePrev = () => {
        const newOffset = Math.max(0, offset - limit);
        setOffset(newOffset);
        fetchDay(data?.dia || 1, newOffset);
    };

    const handleNext = () => {
        const total = data?.pagination?.total_records || 0;
        if (offset + limit < total) {
            const newOffset = offset + limit;
            setOffset(newOffset);
            fetchDay(data?.dia || 1, newOffset);
        }
    };

    const stats = data?.stats;
    const records = data?.records || [];
    const pagination = data?.pagination;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                        Vector de Estado
                    </h1>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        Explorá los registros de la simulación por jornada.
                    </p>
                </div>
                <button
                    onClick={() => simulationService.downloadCsv()}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98]"
                >
                    <Download className="h-4 w-4" />
                    Descargar CSV
                </button>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard
                        icon={Clock}
                        label="Fin de Jornada"
                        value={stats.fin_jornada_hhmm}
                        color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    />
                    <StatCard
                        icon={Car}
                        label="Autos Atendidos"
                        value={stats.autos_atendidos}
                        color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    />
                    <StatCard
                        icon={Truck}
                        label="Camionetas Atendidas"
                        value={stats.camionetas_atendidas}
                        color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    />
                    <StatCard
                        icon={AlarmClock}
                        label="Máx. Cola del Día"
                        value={stats.max_cola != null ? `${stats.max_cola} veh.` : "—"}
                        color="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                    />
                </div>
            )}

            {/* Controles */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Selector de día */}
                <form onSubmit={handleDaySearch} className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Día</span>
                    <input
                        type="number"
                        min={1}
                        max={totalDias || undefined}
                        value={dayInput}
                        onChange={(e) => setDayInput(e.target.value)}
                        onBlur={(e) => setDayInput(clampDia(e.target.value))}
                        className="h-9 w-20 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <button
                        type="submit"
                        className="flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                    >
                        <Search className="h-3.5 w-3.5" />
                        Buscar
                    </button>
                    {totalDias && (
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            {totalDias} días simulados
                        </span>
                    )}
                </form>

                {/* Toggle formato de tiempo */}
                <button
                    onClick={() => setTimeMode(v => !v)}
                    className={[
                        "flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition",
                        timeMode
                            ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
                    ].join(" ")}
                >
                    <AlarmClock className="h-3.5 w-3.5" />
                    {timeMode ? "HH:MM:SS" : "Minutos"}
                </button>

                {/* Filtro de columnas */}
                <div className="relative ml-auto">
                    <button
                        onClick={() => setShowColumnMenu(v => !v)}
                        className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Columnas
                    </button>

                    {showColumnMenu && columnGroups.length > 0 && (
                        <div className="absolute right-0 top-10 z-50 max-h-72 w-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
                                Grupos de Columnas
                            </p>
                            {columnGroups.map((group) => (
                                <label
                                    key={group.id}
                                    className={[
                                        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition",
                                        group.fixed
                                            ? "cursor-default text-zinc-400"
                                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                                    ].join(" ")}
                                >
                                    <input
                                        type="checkbox"
                                        checked={visibleGroupsResolved[group.id] !== false}
                                        disabled={group.fixed}
                                        onChange={() =>
                                            !group.fixed &&
                                            setVisibleGroups(v => ({ ...v, [group.id]: !(v?.[group.id] !== false) }))
                                        }
                                        className="h-3.5 w-3.5 accent-zinc-900 dark:accent-zinc-100"
                                    />
                                    {group.label}
                                    {group.fixed && (
                                        <span className="ml-auto text-xs text-zinc-300 dark:text-zinc-600">fijo</span>
                                    )}
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Tabla */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <div className="relative max-h-[60vh] overflow-y-auto">
                        <table className="w-full min-w-max text-left text-xs">
                            {/* Headers en 2 niveles */}
                            <thead className="sticky top-0 z-20 border-b-2 border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                                {/* Fila 1: grupos */}
                                <tr>
                                    {columnGroups
                                        .filter(g => visibleGroupsResolved[g.id] !== false)
                                        .map(g => {
                                            const colsInGroup = g.keys.filter(k => allKeys.includes(k) && visibleKeys.includes(k));
                                            if (colsInGroup.length === 0) return null;
                                            return (
                                                <th
                                                    key={g.id}
                                                    colSpan={colsInGroup.length}
                                                    className="border-r border-zinc-200 px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:text-zinc-300 last:border-r-0"
                                                >
                                                    {g.label}
                                                </th>
                                            );
                                        })}
                                </tr>
                                {/* Fila 2: columnas individuales */}
                                <tr className="border-t border-zinc-200 dark:border-zinc-700">
                                    {visibleKeys.map(key => (
                                        <th
                                            key={key}
                                            className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400"
                                        >
                                            {getShortLabel(key)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-zinc-950">
                                {loading ? (
                                    <tr>
                                        <td colSpan={99} className="py-16 text-center text-sm text-zinc-400">
                                            Cargando registros...
                                        </td>
                                    </tr>
                                ) : records.length === 0 ? (
                                    <tr>
                                        <td colSpan={99} className="py-16 text-center text-sm text-zinc-400">
                                            No hay registros. Ejecutá una simulación primero.
                                        </td>
                                    </tr>
                                ) : (
                                    records.map((rec, idx) => (
                                        <DataRow
                                            key={idx}
                                            record={rec}
                                            visibleKeys={visibleKeys}
                                            timeMode={timeMode}
                                        />
                                    ))
                                )}
                                {/* Sticky bottom: último registro de la simulación */}
                                {lastRow && visibleKeys.length > 0 && (
                                    <DataRow
                                        record={lastRow}
                                        visibleKeys={visibleKeys}
                                        timeMode={timeMode}
                                        isSticky
                                    />
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Leyenda sticky row */}
            {lastRow && (
                <p className="text-xs text-zinc-400 dark:text-zinc-600">
                    ↑ La fila sombreada al fondo es el último registro de toda la simulación (siempre visible).
                </p>
            )}

            {/* Paginación */}
            {pagination && (
                <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                    <span>
                        Mostrando {offset + 1}–{Math.min(offset + limit, pagination.total_records)} de {pagination.total_records} registros
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={handlePrev}
                            disabled={offset === 0}
                            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                            ← Anterior
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={offset + limit >= pagination.total_records}
                            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                            Siguiente →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
