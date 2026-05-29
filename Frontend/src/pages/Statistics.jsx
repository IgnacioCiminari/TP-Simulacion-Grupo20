import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSimulation } from "../context/SimulationContext";
import simulationService from "../services/simulation.service";
import { toast } from "sonner";
import {
    Clock,
    Car,
    Truck,
    Timer,
    Lock,
    BarChart3,
    AlertTriangle,
    Loader2,
    Download,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtMin(val) {
    if (val == null || isNaN(val)) return "—";
    return `${parseFloat(val).toFixed(2)} min`;
}

function fmtPct(val) {
    if (val == null || isNaN(val)) return "—";
    return `${parseFloat(val).toFixed(2)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente: KPI Card
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, subvalue, color, wide = false }) {
    return (
        <div
            className={[
                "flex items-start gap-4 rounded-2xl border p-5 transition-shadow hover:shadow-md",
                "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
                wide ? "col-span-2 sm:col-span-1" : "",
            ].join(" ")}
        >
            <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{label}</p>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50 truncate">{value}</p>
                {subvalue && (
                    <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{subvalue}</p>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente: Barra de bloqueo
// ─────────────────────────────────────────────────────────────────────────────

function BloqueoBar({ lineId, pct }) {
    const pctNum = parseFloat(pct) || 0;
    const color =
        pctNum < 20 ? "bg-emerald-500" :
        pctNum < 40 ? "bg-amber-500" :
        "bg-red-500";

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Línea {lineId}</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{fmtPct(pctNum)}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${color}`}
                    style={{ width: `${Math.min(pctNum, 100)}%` }}
                />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página: Statistics
// ─────────────────────────────────────────────────────────────────────────────

export default function Statistics() {
    const navigate = useNavigate();
    const { globalStats, setGlobalStats, totalDias, setTotalDias } = useSimulation();
    const [loading, setLoading] = useState(!globalStats);
    const [error, setError] = useState(null);

    // Si no hay stats en contexto (navegación directa), las trae del backend
    useEffect(() => {
        if (globalStats) {
            setLoading(false);
            return;
        }
        const fetch = async () => {
            try {
                const data = await simulationService.getGlobalStats();
                setGlobalStats(data);
                if (data.total_dias) setTotalDias(data.total_dias);
            } catch (err) {
                const detail = err?.response?.data?.detail ||
                    "No hay simulación activa. Ejecutá una desde Configuración.";
                setError(detail);
                toast.error("Sin datos", { description: detail });
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32">
                <Loader2 className="h-10 w-10 animate-spin text-zinc-400" />
                <p className="mt-4 text-sm text-zinc-400">Cargando estadísticas globales…</p>
            </div>
        );
    }

    if (error || !globalStats) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20">
                    <AlertTriangle className="h-8 w-8 text-red-400" />
                </div>
                <h1 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">Sin datos disponibles</h1>
                <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
                <button
                    onClick={() => navigate("/config")}
                    className="mt-6 rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                >
                    Ir a Configuración
                </button>
            </div>
        );
    }

    const bloqueoEntries = Object.entries(globalStats.porcentaje_bloqueo_global || {});

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                        Estadísticas Globales
                    </h1>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        Resumen de toda la simulación · {totalDias ?? globalStats.total_dias} días simulados
                    </p>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <Timer className="h-4 w-4 text-zinc-500" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        Tiempo de ejecución:
                    </span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                        {globalStats.tiempo_ejecucion}
                    </span>
                </div>
            </div>

            {/* KPIs principales */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    icon={Clock}
                    label="Hora Promedio de Fin"
                    value={globalStats.promedio_fin_jornada_hhmm}
                    color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                />
                <KpiCard
                    icon={Car}
                    label="Autos Atendidos"
                    value={globalStats.total_autos_atendidos?.toLocaleString()}
                    color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                />
                <KpiCard
                    icon={Truck}
                    label="Camionetas Atendidas"
                    value={globalStats.total_camionetas_atendidas?.toLocaleString()}
                    color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                />
                <KpiCard
                    icon={BarChart3}
                    label="Días Simulados"
                    value={(totalDias ?? globalStats.total_dias)?.toLocaleString()}
                    color="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                />
            </div>

            {/* Tiempos de Espera en Cola */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                        <Timer className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Tiempo Promedio de Espera en Cola</h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Promedio global acumulado de toda la simulación</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex items-center gap-4 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-900/10">
                        <Car className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                        <div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">Autos</p>
                            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                                {fmtMin(globalStats.promedio_espera_autos_min)}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 rounded-xl bg-amber-50 p-4 dark:bg-amber-900/10">
                        <Truck className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                        <div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">Camionetas</p>
                            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                                {fmtMin(globalStats.promedio_espera_camionetas_min)}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Bloqueo de Estaciones de Frenos */}
            {bloqueoEntries.length > 0 && (
                <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                            <Lock className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Bloqueo de Estaciones de Frenos</h2>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">Porcentaje global de tiempo en estado bloqueado por línea</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {bloqueoEntries.map(([lineId, pct]) => (
                            <BloqueoBar key={lineId} lineId={lineId} pct={pct} />
                        ))}
                    </div>
                </section>
            )}

            {/* Acciones rápidas */}
            <div className="flex flex-wrap gap-3">
                <button
                    onClick={() => navigate("/table")}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                    <BarChart3 className="h-4 w-4" />
                    Ver Tabla Detallada
                </button>
                <button
                    onClick={() => navigate("/graph")}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                    <BarChart3 className="h-4 w-4" />
                    Ver Gráficos
                </button>
                <button
                    onClick={() => simulationService.downloadCsv()}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98]"
                >
                    <Download className="h-4 w-4" />
                    Descargar CSV
                </button>
            </div>
        </div>
    );
}
