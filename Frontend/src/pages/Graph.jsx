import { useEffect, useState, useMemo } from "react";
import { useSimulation } from "../context/SimulationContext";
import simulationService from "../services/simulation.service";
import { toast } from "sonner";
import {
    LineChart, Line,
    BarChart, Bar,
    AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer,
} from "recharts";
import { TrendingUp, AlertTriangle, BarChart3, Loader2 } from "lucide-react";

// ==============================
// Downsampling: promedia grupos de N días en un solo punto
// ==============================
const THRESHOLD = 60; // a partir de cuántos días agrupamos

// Normaliza un único día al formato esperado por los gráficos
function normalizeDay(d) {
    return {
        label: `Día ${d.dia}`,
        dia: d.dia,
        espera_autos: d.promedio_espera_autos_min ?? 0,
        espera_camionetas: d.promedio_espera_camionetas_min ?? 0,
        autos_atendidos: d.autos_atendidos ?? 0,
        camionetas_atendidas: d.camionetas_atendidas ?? 0,
        bloqueo_l1: d.bloqueo_l1 ?? 0,
        bloqueo_l2: d.bloqueo_l2 ?? 0,
    };
}

function downsample(data, groupSize) {
    // Sin agrupación: normalizar igualmente los campos
    if (groupSize <= 1) return data.map(normalizeDay);
    const result = [];
    for (let i = 0; i < data.length; i += groupSize) {
        const chunk = data.slice(i, i + groupSize);
        const avgOf = (key) => chunk.reduce((s, d) => s + (d[key] ?? 0), 0) / chunk.length;
        result.push({
            label: `Días ${chunk[0].dia}–${chunk[chunk.length - 1].dia}`,
            espera_autos: parseFloat(avgOf("promedio_espera_autos_min").toFixed(4)),
            espera_camionetas: parseFloat(avgOf("promedio_espera_camionetas_min").toFixed(4)),
            autos_atendidos: Math.round(avgOf("autos_atendidos")),
            camionetas_atendidas: Math.round(avgOf("camionetas_atendidas")),
            bloqueo_l1: parseFloat(avgOf("bloqueo_l1").toFixed(2)),
            bloqueo_l2: parseFloat(avgOf("bloqueo_l2").toFixed(2)),
        });
    }
    return result;
}

// ==============================
// Top N peores días por métrica
// ==============================
function topWorstDays(data, key, n = 10) {
    return [...data]
        .sort((a, b) => b[key] - a[key])
        .slice(0, n)
        .map((d) => ({ ...d, label: `Día ${d.dia}` }));
}

// ==============================
// Tooltip personalizado
// ==============================
function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <p className="mb-1.5 font-semibold text-zinc-700 dark:text-zinc-200">{label}</p>
            {payload.map((p) => (
                <p key={p.dataKey} style={{ color: p.color }} className="leading-relaxed">
                    {p.name}: <span className="font-medium">{p.value}</span>
                </p>
            ))}
        </div>
    );
}

// ==============================
// Wrapper de cada gráfico
// ==============================
function ChartCard({ title, subtitle, icon: Icon, children }) {
    return (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-5 flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <Icon className="h-4.5 w-4.5 h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                </div>
                <div>
                    <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
                    {subtitle && (
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
                    )}
                </div>
            </div>
            {children}
        </div>
    );
}

// ==============================
// Badge de modo (agrupado / top peores)
// ==============================
function ModeBadge({ grouped, groupSize }) {
    if (!grouped) return null;
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Vista agrupada cada {groupSize} días
        </span>
    );
}

// ==============================
// Página Graph
// ==============================
export default function Graph() {
    const { setTotalDias } = useSimulation();
    const [rawData, setRawData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            try {
                const result = await simulationService.getAllStats();
                // Normalizar: extraer bloqueo L1 y L2 de la estructura de objeto
                const normalized = result.estadisticas.map((d) => ({
                    ...d,
                    bloqueo_l1: d.porcentaje_bloqueo_frenos?.["1"] ?? 0,
                    bloqueo_l2: d.porcentaje_bloqueo_frenos?.["2"] ?? 0,
                }));
                setRawData(normalized);
                setTotalDias(result.total_dias); // actualiza el clamp de la Tabla también
            } catch (err) {
                const detail = err?.response?.data?.detail || "No hay simulación activa. Ejecutá una desde Configuración.";
                setError(detail);
                toast.error("Error al cargar estadísticas", { description: detail });
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    // ── Cálculo del grupo ──────────────────────────────────────────────
    const groupSize = useMemo(() => {
        if (!rawData) return 1;
        const n = rawData.length;
        if (n <= THRESHOLD) return 1;
        if (n <= 200) return 7;    // semanas
        if (n <= 600) return 30;   // meses
        return Math.ceil(n / 20);  // ~20 puntos siempre
    }, [rawData]);

    const isGrouped = groupSize > 1;

    // ── Gráfico 1: Tiempos de espera (línea temporal) ─────────────────
    const waitData = useMemo(() => {
        if (!rawData) return [];
        return downsample(rawData, groupSize);
    }, [rawData, groupSize]);

    // ── Gráfico 2: Top peores días por bloqueo L1 ────────────────────
    const worstBloqueoData = useMemo(() => {
        if (!rawData) return [];
        return topWorstDays(rawData, "bloqueo_l1", Math.min(10, rawData.length));
    }, [rawData]);

    // ── Gráfico 3: Vehículos atendidos (area chart, agrupado) ─────────
    const atendidosData = useMemo(() => {
        if (!rawData) return [];
        return downsample(rawData, groupSize);
    }, [rawData, groupSize]);

    // ── Estados de UI ──────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-zinc-400" />
                <p className="mt-4 text-sm text-zinc-400">Cargando estadísticas…</p>
            </div>
        );
    }

    if (error || !rawData) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20">
                    <AlertTriangle className="h-8 w-8 text-red-400" />
                </div>
                <h1 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">
                    Sin datos disponibles
                </h1>
                <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
            </div>
        );
    }

    const totalDias = rawData.length;
    const labelKey = "label";

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                        Análisis de Simulación
                    </h1>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        {totalDias} jornadas simuladas
                        {isGrouped && ` · agrupadas cada ${groupSize} días`}
                    </p>
                </div>
                <ModeBadge grouped={isGrouped} groupSize={groupSize} />
            </div>

            {/* ── Gráfico 1: Tiempos de Espera ─────────────────────── */}
            <ChartCard
                icon={TrendingUp}
                title="Tiempos de Espera Promedio"
                subtitle="Evolución del tiempo medio de espera por tipo de vehículo a lo largo de las jornadas"
            >
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={waitData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e4e4e7)" />
                        <XAxis
                            dataKey={labelKey}
                            tick={{ fontSize: 11, fill: "#71717a" }}
                            tickLine={false}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: "#71717a" }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => `${v} min`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                        <Line
                            type="monotone"
                            dataKey="espera_autos"
                            name="Espera Autos (min)"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={totalDias <= 30}
                            activeDot={{ r: 5 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="espera_camionetas"
                            name="Espera Camionetas (min)"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={totalDias <= 30}
                            activeDot={{ r: 5 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* ── Gráfico 2: Top peores días por bloqueo ────────────── */}
            <ChartCard
                icon={AlertTriangle}
                title="Cuello de Botella: Top días con mayor bloqueo"
                subtitle={`Los ${worstBloqueoData.length} días con mayor % de tiempo en bloqueo por línea de frenos`}
            >
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={worstBloqueoData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e4e4e7)" />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "#71717a" }}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: "#71717a" }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                        <Bar dataKey="bloqueo_l1" name="Bloqueo L1 (%)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="bloqueo_l2" name="Bloqueo L2 (%)" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* ── Gráfico 3: Productividad diaria (área) ─────────────── */}
            <ChartCard
                icon={BarChart3}
                title="Productividad por Jornada"
                subtitle="Cantidad de vehículos atendidos por día (o promedio por período si está agrupado)"
            >
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={atendidosData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <defs>
                            <linearGradient id="gradAutos" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradCamionetas" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e4e4e7)" />
                        <XAxis
                            dataKey={labelKey}
                            tick={{ fontSize: 11, fill: "#71717a" }}
                            tickLine={false}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: "#71717a" }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                        <Area
                            type="monotone"
                            dataKey="autos_atendidos"
                            name={isGrouped ? "Autos atendidos (prom.)" : "Autos atendidos"}
                            stroke="#3b82f6"
                            strokeWidth={2}
                            fill="url(#gradAutos)"
                        />
                        <Area
                            type="monotone"
                            dataKey="camionetas_atendidas"
                            name={isGrouped ? "Camionetas atendidas (prom.)" : "Camionetas atendidas"}
                            stroke="#f59e0b"
                            strokeWidth={2}
                            fill="url(#gradCamionetas)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </ChartCard>
        </div>
    );
}
