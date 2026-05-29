import { useState, useEffect, useCallback } from "react";
import { useSimulation } from "../context/SimulationContext";
import simulationService from "../services/simulation.service";
import { toast } from "sonner";
import {
    useReactTable,
    getCoreRowModel,
    flexRender,
} from "@tanstack/react-table";
import { Clock, Car, Truck, Timer, SlidersHorizontal, ChevronDown, ChevronRight, Search } from "lucide-react";

// ==============================
// Definición de Grupos de Columnas
// ==============================
const COLUMN_GROUPS = [
    {
        id: "base",
        label: "Base",
        fixed: true,
        keys: ["Dia", "Evento", "Reloj_min"],
    },
    {
        id: "llegada_auto",
        label: "Llegada Auto",
        keys: ["RND_Llegada_Auto", "Tiempo_Entre_Llegadas_Auto", "Prox_Llegada_Auto"],
    },
    {
        id: "llegada_camioneta",
        label: "Llegada Camioneta",
        keys: ["RND_Llegada_Camioneta", "Tiempo_Entre_Llegadas_Camioneta", "Prox_Llegada_Camioneta"],
    },
    {
        id: "colas",
        label: "Colas",
        keys: ["Cola_Autos", "Cola_Camionetas"],
    },
    {
        id: "servidor_l1",
        label: "Servidor L1",
        keys: ["Estado_Frenos_L1", "Estado_Luces_L1", "Fin_Frenos_L1", "Fin_Luces_L1"],
    },
    {
        id: "servidor_l2",
        label: "Servidor L2",
        keys: ["Estado_Frenos_L2", "Estado_Luces_L2", "Fin_Frenos_L2", "Fin_Luces_L2"],
    },
    {
        id: "atendidos",
        label: "Atendidos",
        keys: ["Cant_Autos_Atendidos", "Cant_Camionetas_Atendidas"],
    },
    {
        id: "tiempos_espera",
        label: "Tiempos de Espera",
        keys: ["Tiempo_Espera_Auto", "Tiempo_Acumulado_Espera_Auto", "Tiempo_Espera_Camioneta", "Tiempo_Acumulado_Espera_Camioneta"],
    },
    {
        id: "tiempos_bloqueo",
        label: "Tiempos de Bloqueo",
        keys: ["Tiempo_Bloqueo_L1", "Tiempo_Acumulado_Bloqueo_L1", "Tiempo_Bloqueo_L2", "Tiempo_Acumulado_Bloqueo_L2"],
    },
    {
        id: "clientes_activos",
        label: "Clientes Activos",
        keys: ["Clientes_Activos"],
    },
];

// ==============================
// Componente: Badge de Cliente
// ==============================
const CLIENT_COLORS = {
    Auto: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    Camioneta: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

const ESTADO_COLORS = {
    En_Frenos: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    En_Luces: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    En_Cola: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

function ClienteBadge({ cliente }) {
    const color = CLIENT_COLORS[cliente.tipo] || CLIENT_COLORS.Auto;
    const Icon = cliente.tipo === "Camioneta" ? Truck : Car;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
            <Icon className="h-3 w-3" />
            #{cliente.id}
        </span>
    );
}

function ClientesExpandido({ clientes }) {
    if (!clientes || clientes.length === 0) return (
        <p className="text-xs text-zinc-400 italic">Sin clientes activos</p>
    );
    return (
        <div className="mt-2 space-y-1.5">
            {clientes.map((c) => {
                const estadoColor = ESTADO_COLORS[c.estado] || ESTADO_COLORS.En_Cola;
                return (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
                        <ClienteBadge cliente={c} />
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estadoColor}`}>{c.estado}</span>
                        {c.linea && (
                            <span className="text-xs text-zinc-500">Línea {c.linea}</span>
                        )}
                        <span className="text-xs text-zinc-400">
                            Llegó: {parseFloat(c.hora_llegada).toFixed(2)} min
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ==============================
// Componente: Fila Expandible
// ==============================
function ExpandableRow({ row, visibleColumns, allColumns }) {
    const [expanded, setExpanded] = useState(false);
    const clientes = row.original.Clientes_Activos;
    const hasClientes = Array.isArray(clientes) && clientes.length > 0;

    return (
        <>
            <tr
                className="border-b border-zinc-100 transition-colors hover:bg-zinc-50/80 dark:border-zinc-800 dark:hover:bg-zinc-800/40 cursor-pointer"
                onClick={() => hasClientes && setExpanded((e) => !e)}
            >
                {row.getVisibleCells().filter(cell => cell.column.id !== "Clientes_Activos").map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                ))}
                {/* Columna Clientes Activos siempre visible si está habilitada */}
                {visibleColumns.includes("Clientes_Activos") && (
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                        <div className="flex items-center gap-2">
                            {hasClientes ? (
                                <>
                                    <span className="flex flex-wrap gap-1">
                                        {clientes.map((c) => <ClienteBadge key={c.id} cliente={c} />)}
                                    </span>
                                    {expanded
                                        ? <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                                        : <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                                    }
                                </>
                            ) : (
                                <span className="text-xs text-zinc-400">—</span>
                            )}
                        </div>
                    </td>
                )}
            </tr>
            {expanded && hasClientes && (
                <tr className="bg-zinc-50/50 dark:bg-zinc-900/30">
                    <td colSpan={allColumns} className="px-6 pb-4 pt-2">
                        <ClientesExpandido clientes={clientes} />
                    </td>
                </tr>
            )}
        </>
    );
}

// ==============================
// Componente: Stats Card
// ==============================
function StatCard({ icon: Icon, label, value, color }) {
    return (
        <div className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
            </div>
        </div>
    );
}

// ==============================
// Página Principal: Table
// ==============================
export default function Table() {
    const { simulationResult, totalDias } = useSimulation();
    const [dayInput, setDayInput] = useState(1);
    const [data, setData] = useState(simulationResult || null);
    const [loading, setLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const [limit] = useState(50);

    // Clamp: mantiene el valor entre 1 y totalDias (si se conoce)
    const clampDia = (val) => {
        const n = parseInt(val, 10);
        if (isNaN(n)) return 1;
        const min = 1;
        const max = totalDias || Infinity;
        return Math.min(Math.max(n, min), max);
    };

    // Grupos visibles (todos activados por defecto excepto los "grupos pesados")
    const [visibleGroups, setVisibleGroups] = useState(
        COLUMN_GROUPS.reduce((acc, g) => ({ ...acc, [g.id]: true }), {})
    );
    const [showColumnMenu, setShowColumnMenu] = useState(false);

    // Columnas visibles derivadas de grupos activos
    const visibleColumnKeys = COLUMN_GROUPS
        .filter((g) => visibleGroups[g.id])
        .flatMap((g) => g.keys);

    const fetchDay = useCallback(async (dia, off) => {
        setLoading(true);
        try {
            const result = await simulationService.getDayRecords(dia, off, limit);
            setData(result);
        } catch (err) {
            const raw = err?.response?.data?.detail || "";
            // Transformar el error verboso de FastAPI en algo amigable
            let friendly = "Error al consultar el día.";
            if (raw.includes("no existe")) {
                const diasMatch = raw.match(/Días disponibles: \[([\d, ]+)\]/);
                const cantDias = diasMatch
                    ? diasMatch[1].split(",").length
                    : totalDias ?? "desconocidos";
                friendly = `Día ${dia} no encontrado · ${cantDias} días simulados`;
            } else if (raw.includes("No hay ninguna simulación")) {
                friendly = "No hay ninguna simulación activa. Ejecutá una desde Configuración.";
            }
            toast.error("Día no encontrado", { description: friendly });
        } finally {
            setLoading(false);
        }
    }, [limit, totalDias]);

    // Carga inicial si ya hay resultado del POST
    useEffect(() => {
        if (simulationResult) {
            setData(simulationResult);
        } else {
            fetchDay(1, 0);
        }
    }, []);

    const handleDaySearch = (e) => {
        e.preventDefault();
        const dia = clampDia(dayInput);
        setDayInput(dia); // corregir visualmente si había un valor fuera de rango
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

    // Construir columnas de TanStack
    const records = data?.records || [];
    const sampleKeys = records.length > 0
        ? Object.keys(records[0]).filter(k => k !== "Clientes_Activos" && visibleColumnKeys.includes(k))
        : [];

    const columns = [
        ...sampleKeys.map((key) => ({
            id: key,
            accessorKey: key,
            header: key.replace(/_/g, " "),
            cell: (info) => info.getValue() ?? "—",
        })),
    ];

    const table = useReactTable({
        data: records,
        columns,
        getCoreRowModel: getCoreRowModel(),
        columnVisibility: Object.fromEntries(
            Object.keys(records[0] || {}).map((k) => [k, visibleColumnKeys.includes(k)])
        ),
    });

    const stats = data?.stats;
    const pagination = data?.pagination;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    Vector de Estado
                </h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Explorá los registros de la simulación por jornada.
                </p>
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
                        icon={Timer}
                        label="Espera Media Autos"
                        value={`${stats.promedio_espera_autos_min?.toFixed(4)} min`}
                        color="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    />
                </div>
            )}

            {/* Controles: Día + Columnas */}
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

                {/* Filtro de columnas */}
                <div className="relative ml-auto">
                    <button
                        onClick={() => setShowColumnMenu((v) => !v)}
                        className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Columnas
                    </button>

                    {showColumnMenu && (
                        <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
                                Grupos de Columnas
                            </p>
                            {COLUMN_GROUPS.map((group) => (
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
                                        checked={visibleGroups[group.id]}
                                        disabled={group.fixed}
                                        onChange={() =>
                                            !group.fixed &&
                                            setVisibleGroups((v) => ({ ...v, [group.id]: !v[group.id] }))
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
                    <div className="max-h-[60vh] overflow-y-auto">
                        <table className="w-full min-w-max text-left text-sm">
                            {/* Sticky Header */}
                            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <tr key={headerGroup.id}>
                                        {headerGroup.headers
                                            .filter(h => h.column.id !== "Clientes_Activos")
                                            .map((header) => (
                                                <th
                                                    key={header.id}
                                                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                                                >
                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                </th>
                                            ))}
                                        {visibleGroups["clientes_activos"] && (
                                            <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                                Clientes Activos
                                            </th>
                                        )}
                                    </tr>
                                ))}
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
                                    table.getRowModel().rows.map((row) => (
                                        <ExpandableRow
                                            key={row.id}
                                            row={row}
                                            visibleColumns={visibleColumnKeys}
                                            allColumns={columns.length + 1}
                                        />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

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
