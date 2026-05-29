import { useEffect, useState, useMemo } from "react";
import { useSimulation } from "../context/SimulationContext";
import simulationService from "../services/simulation.service";
import { toast } from "sonner";
import {
    BarChart, Bar,
    AreaChart, Area,
    ScatterChart, Scatter, ZAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer,
} from "recharts";
import { TrendingUp, AlertTriangle, BarChart3, Clock, Loader2, Activity } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Top N días por métrica (descendente)
// ─────────────────────────────────────────────────────────────────────────────

function topWorstDays(data, keyFn, n = 10) {
    return [...data]
        .sort((a, b) => keyFn(b) - keyFn(a))
        .slice(0, n)
        .map(d => ({ ...d, label: `D.${d.dia}` }));
}

// Convierte minutos a HH:MM para el eje de bloqueo de cierre
function minToHHMM(min) {
    if (!min && min !== 0) return "—";
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip personalizado
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <p className="mb-1.5 font-semibold text-zinc-700 dark:text-zinc-200">{label}</p>
            {payload.map(p => (
                <p key={p.dataKey} style={{ color: p.color }} className="leading-relaxed">
                    {p.name}: <span className="font-medium">{
                        typeof p.value === "number" ? p.value.toFixed(2) : p.value
                    }</span>
                </p>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper de gráfico
// ─────────────────────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, icon: Icon, children }) {
    return (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-5 flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <Icon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
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

// ─────────────────────────────────────────────────────────────────────────────
// Paleta de colores para N líneas de frenos
// ─────────────────────────────────────────────────────────────────────────────

const BLOQUEO_COLORS = ["#ef4444", "#f97316", "#eab308", "#a855f7", "#06b6d4", "#10b981"];
const SERVICIO_COLORS = ["#10b981", "#059669", "#047857", "#34d399", "#6ee7b7", "#a7f3d0"];

// ─────────────────────────────────────────────────────────────────────────────
// Normalizar: aplanar porcentaje_bloqueo_frenos y calcular ocupación
// ─────────────────────────────────────────────────────────────────────────────

function normalizeDay(d) {
    const bloqueo = d.porcentaje_bloqueo_frenos || {};
    const totalServicio = d.total_servicio_min || {};
    const lineIds = Object.keys(bloqueo).map(Number).sort((a, b) => a - b);

    // Suma de bloqueos para el scatter
    const sumBloqueo = lineIds.length
        ? lineIds.reduce((s, lid) => s + (bloqueo[String(lid)] ?? 0), 0)
        : 0;

    const waitAuto = d.promedio_espera_autos_min ?? 0;
    const waitCam = d.promedio_espera_camionetas_min ?? 0;
    // Un promedio simple o suma (para visualización correlacional)
    const avgEspera = (waitAuto + waitCam) / 2;

    const flat = {
        dia: d.dia,
        label: `D.${d.dia}`,
        autos_atendidos: d.autos_atendidos ?? 0,
        camionetas_atendidas: d.camionetas_atendidas ?? 0,
        fin_jornada_min: d.fin_jornada_min ?? 0,
        fin_jornada_hhmm: d.fin_jornada_hhmm ?? "",
        avg_bloqueo: parseFloat(sumBloqueo.toFixed(2)),
        avg_espera: parseFloat(avgEspera.toFixed(2)),
    };

    for (const lid of lineIds) {
        flat[`bloqueo_l${lid}`] = parseFloat((bloqueo[String(lid)] ?? 0).toFixed(2));
        flat[`servicio_l${lid}`] = parseFloat((totalServicio[String(lid)] ?? 0).toFixed(2));
    }
    return flat;
}

// ─────────────────────────────────────────────────────────────────────────────
// Downsampling para series largas
// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLD = 60;

function downsample(data, groupSize) {
    if (groupSize <= 1) return data;
    const result = [];
    for (let i = 0; i < data.length; i += groupSize) {
        const chunk = data.slice(i, i + groupSize);
        const avgOf = key => chunk.reduce((s, d) => s + (d[key] ?? 0), 0) / chunk.length;
        const obj = {
            label: `D.${chunk[0].dia}–${chunk[chunk.length - 1].dia}`,
            autos_atendidos: Math.round(avgOf("autos_atendidos")),
            camionetas_atendidas: Math.round(avgOf("camionetas_atendidas")),
        };
        // Promediar bloqueo por línea
        const lineKeys = Object.keys(chunk[0]).filter(k => /^bloqueo_l\d+$/.test(k));
        for (const k of lineKeys) obj[k] = parseFloat(avgOf(k).toFixed(2));
        result.push(obj);
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Página Graph
// ─────────────────────────────────────────────────────────────────────────────

export default function Graph() {
    const { setTotalDias } = useSimulation();
    const [rawData, setRawData] = useState(null);
    const [lineIds, setLineIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            try {
                const result = await simulationService.getAllStats();
                const normalized = result.estadisticas.map(normalizeDay);
                setRawData(normalized);
                setTotalDias(result.total_dias);

                // Detectar IDs de líneas desde los datos del primer día
                if (result.estadisticas.length > 0) {
                    const bloqueo = result.estadisticas[0].porcentaje_bloqueo_frenos || {};
                    setLineIds(Object.keys(bloqueo).map(Number).sort((a, b) => a - b));
                }
            } catch (err) {
                const detail = err?.response?.data?.detail || "No hay simulación activa.";
                setError(detail);
                toast.error("Error al cargar estadísticas", { description: detail });
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    const groupSize = useMemo(() => {
        if (!rawData) return 1;
        const n = rawData.length;
        if (n <= THRESHOLD) return 1;
        if (n <= 200) return 7;
        if (n <= 600) return 30;
        return Math.ceil(n / 20);
    }, [rawData]);

    const isGrouped = groupSize > 1;
    const TOP_N = 10;

    // ── Gráfico 1: Top peores días de bloqueo ─────────────────────────────
    const worstBloqueoData = useMemo(() => {
        if (!rawData || lineIds.length === 0) return [];
        // Ordenar por suma de bloqueo de todas las líneas
        return topWorstDays(rawData, d => lineIds.reduce((s, lid) => s + (d[`bloqueo_l${lid}`] ?? 0), 0), Math.min(TOP_N, rawData.length));
    }, [rawData, lineIds]);

    // ── Gráfico 2: Top días con mayor tiempo de atención (Servicio) ──────
    const topServicioData = useMemo(() => {
        if (!rawData || lineIds.length === 0) return [];
        return topWorstDays(rawData, d => lineIds.reduce((s, lid) => s + (d[`servicio_l${lid}`] ?? 0), 0), Math.min(TOP_N, rawData.length));
    }, [rawData, lineIds]);

    // ── Gráfico 3: Vehículos atendidos por día (serie temporal) ───────────
    const atendidosData = useMemo(() => {
        if (!rawData) return [];
        return downsample(rawData, groupSize);
    }, [rawData, groupSize]);

    // ── Gráfico 4: Correlación Espera vs Bloqueo (Scatter) ────────────────
    const scatterData = useMemo(() => {
        if (!rawData) return [];
        // Filtramos outliars extremos o días sin espera
        return rawData.map(d => ({
            dia: d.dia,
            bloqueo: d.avg_bloqueo,
            espera: d.avg_espera,
        }));
    }, [rawData]);

    // ── Gráfico 5: Histograma de Distribución de Horas de Cierre ──────────
    const histCierreData = useMemo(() => {
        if (!rawData || rawData.length === 0) return [];
        // Aislar la hora de cierre por defecto (el mínimo > 0) y agrupar el resto en 5 min
        const mins = rawData.map(d => d.fin_jornada_min).filter(m => m > 0);
        if (mins.length === 0) return [];
        const minCierre = Math.min(...mins);

        const bins = {};
        for (const d of rawData) {
            const min = d.fin_jornada_min;
            if (min <= 0) continue;
            
            if (min === minCierre) {
                bins["default"] = (bins["default"] || 0) + 1;
            } else {
                const binStart = Math.floor(min / 5) * 5;
                bins[binStart] = (bins[binStart] || 0) + 1;
            }
        }
        
        // Convertir a array y ordenar
        const keys = Object.keys(bins);
        const sortedKeys = keys.sort((a, b) => {
            if (a === "default") return -1;
            if (b === "default") return 1;
            return Number(a) - Number(b);
        });
        
        return sortedKeys.map(k => {
            if (k === "default") {
                return { binStart: minCierre, label: `${minToHHMM(minCierre)} (Puntual)`, frecuencia: bins[k] };
            }
            const b = Number(k);
            return {
                binStart: b,
                label: `${minToHHMM(b)} – ${minToHHMM(b + 5)}`,
                frecuencia: bins[k],
            };
        });
    }, [rawData]);

    // ── Estados de UI ──────────────────────────────────────────────────────
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
                <h1 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">Sin datos disponibles</h1>
                <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
            </div>
        );
    }

    const totalDias = rawData.length;

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
                {isGrouped && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        Vista agrupada cada {groupSize} días
                    </span>
                )}
            </div>

            {/* ── Gráfico 1: Top peores días por bloqueo ─── */}
            <ChartCard
                icon={AlertTriangle}
                title="Cuello de Botella: Top días con mayor bloqueo"
                subtitle={`Los ${worstBloqueoData.length} días con mayor % de tiempo en bloqueo por líneas de frenos`}
            >
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={worstBloqueoData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e4e4e7)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                        {lineIds.map((lid, idx) => (
                            <Bar
                                key={lid}
                                dataKey={`bloqueo_l${lid}`}
                                name={`Bloqueo L${lid} (%)`}
                                fill={BLOQUEO_COLORS[idx % BLOQUEO_COLORS.length]}
                                radius={[4, 4, 0, 0]}
                                stackId="bloqueo"
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* ── Gráfico 2: Top atención de servidores ─── */}
            <ChartCard
                icon={TrendingUp}
                title="Top días con mayor tiempo de atención"
                subtitle={`Los ${topServicioData.length} días donde los servidores estuvieron más tiempo en servicio activo`}
            >
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topServicioData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e4e4e7)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} />
                        <YAxis
                            tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false}
                            tickFormatter={v => `${v}m`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                        {lineIds.map((lid, idx) => (
                            <Bar
                                key={lid}
                                dataKey={`servicio_l${lid}`}
                                name={`Servicio L${lid} (min)`}
                                fill={SERVICIO_COLORS[idx % SERVICIO_COLORS.length]}
                                radius={[4, 4, 0, 0]}
                                stackId="servicio"
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* ── Gráfico 3: Vehículos atendidos por día ─── */}
            <ChartCard
                icon={BarChart3}
                title="Productividad por Jornada"
                subtitle="Cantidad total de vehículos atendidos por día (promedio si está agrupado)"
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
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                        <Area
                            type="monotone"
                            dataKey="autos_atendidos"
                            name={isGrouped ? "Autos (prom.)" : "Autos atendidos"}
                            stroke="#3b82f6" strokeWidth={2} fill="url(#gradAutos)"
                        />
                        <Area
                            type="monotone"
                            dataKey="camionetas_atendidas"
                            name={isGrouped ? "Camionetas (prom.)" : "Camionetas atendidas"}
                            stroke="#f59e0b" strokeWidth={2} fill="url(#gradCamionetas)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* ── Gráfico 4: Correlación Espera vs Bloqueo ─── */}
            <ChartCard
                icon={Activity}
                title="Impacto del Bloqueo en la Espera"
                subtitle="Relación entre el % de bloqueo total diario y el tiempo de espera promedio"
            >
                <ResponsiveContainer width="100%" height={260}>
                    <ScatterChart margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e4e4e7)" />
                        <XAxis
                            type="number"
                            dataKey="bloqueo"
                            name="Bloqueo Total (%)"
                            tick={{ fontSize: 11, fill: "#71717a" }}
                            tickLine={false}
                            tickFormatter={v => `${v}%`}
                        />
                        <YAxis
                            type="number"
                            dataKey="espera"
                            name="Espera Promedio (min)"
                            tick={{ fontSize: 11, fill: "#71717a" }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <ZAxis type="number" range={[40, 40]} />
                        <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const p = payload[0].payload;
                                return (
                                    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                                        <p className="mb-1.5 font-semibold text-zinc-700 dark:text-zinc-200">Día {p.dia}</p>
                                        <p style={{ color: "#3b82f6" }}>Bloqueo: <span className="font-medium">{p.bloqueo}%</span></p>
                                        <p style={{ color: "#f59e0b" }}>Espera Media: <span className="font-medium">{p.espera} min</span></p>
                                    </div>
                                );
                            }}
                        />
                        <Scatter data={scatterData} fill="#8b5cf6" opacity={0.6} />
                    </ScatterChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* ── Gráfico 5: Distribución de Horas de Cierre ─── */}
            <ChartCard
                icon={Clock}
                title="Distribución de Horas de Cierre"
                subtitle="Frecuencia de cierre agrupada en intervalos de 5 minutos (separando el cierre puntual)"
            >
                <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={histCierreData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e4e4e7)" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} />
                        <YAxis
                            tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: "transparent" }}
                            content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                                        <p className="mb-1.5 font-semibold text-zinc-700 dark:text-zinc-200">{label}</p>
                                        <p style={{ color: "#06b6d4" }}>
                                            Días: <span className="font-medium">{payload[0].value}</span>
                                        </p>
                                    </div>
                                );
                            }}
                        />
                        <Bar dataKey="frecuencia" name="Frecuencia (Días)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </ChartCard>
        </div>
    );
}
