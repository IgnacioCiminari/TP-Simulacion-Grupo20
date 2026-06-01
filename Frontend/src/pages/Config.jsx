import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, Play, CalendarDays, Zap, CheckCircle2 } from "lucide-react";
import { useSimulation } from "../context/SimulationContext";
import simulationService from "../services/simulation.service";
import { Progress } from "../components/ui/Progress";

const DEFAULT_VALUES = {
    hora_apertura: 480.0,
    hora_cierre_puertas: 960.0,
    media_llegada_auto: 15.0,
    media_llegada_camioneta: 30.0,
    frenos_min: 4.0,
    frenos_max: 7.0,
    luces_min: 6.0,
    luces_max: 10.0,
    num_lineas: 2,
    max_dias: 1000,
    max_iteraciones: 100000,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de conversión minutos ↔ HH:MM
// ─────────────────────────────────────────────────────────────────────────────

function minutesToHHMM(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hhmmToMinutes(hhmm) {
    const parts = hhmm.split(":");
    if (parts.length !== 2) return NaN;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return NaN;
    return h * 60 + m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente interno: los dos inputs sincronizados (standalone para evitar
// llamar hooks dentro de render props de Controller)
// ─────────────────────────────────────────────────────────────────────────────

function TimeInputPair({ value, onChange, label, error }) {
    const [hhmmLocal, setHhmmLocal] = useState(() => minutesToHHMM(value ?? 0));
    const minutes = value ?? 0;

    const baseInputClass = [
        "h-10 rounded-md border px-3 text-sm outline-none transition-colors",
        "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100",
        "border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400/30 dark:focus:border-zinc-500",
    ].join(" ");

    const handleMinutesChange = (e) => {
        const val = parseFloat(e.target.value);
        const safe = isNaN(val) ? 0 : val;
        onChange(safe);
        setHhmmLocal(minutesToHHMM(safe));
    };

    const handleHhmmBlur = (e) => {
        const mins = hhmmToMinutes(e.target.value);
        if (!isNaN(mins)) {
            onChange(mins);
            setHhmmLocal(minutesToHHMM(mins));
        } else {
            setHhmmLocal(minutesToHHMM(minutes));
        }
    };

    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
            <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5 flex-1">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">Minutos</span>
                    <input
                        type="number"
                        step="1"
                        min="0"
                        max="1439"
                        value={minutes}
                        onChange={handleMinutesChange}
                        className={`${baseInputClass} w-full`}
                    />
                </div>
                <span className="mt-5 text-zinc-400 dark:text-zinc-600 select-none text-lg">·</span>
                <div className="flex flex-col gap-0.5 flex-1">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">HH:MM</span>
                    <input
                        type="text"
                        placeholder="08:00"
                        value={hhmmLocal}
                        onChange={(e) => setHhmmLocal(e.target.value)}
                        onBlur={handleHhmmBlur}
                        className={`${baseInputClass} w-full`}
                    />
                </div>
            </div>
            {error && <p className="text-xs text-red-500">{error.message}</p>}
        </div>
    );
}

function TimeRangeField({ label, name, control, errors }) {
    return (
        <Controller
            name={name}
            control={control}
            rules={{ required: "Requerido" }}
            render={({ field }) => (
                <TimeInputPair
                    label={label}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors[name]}
                />
            )}
        />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente: Campo simple de número
// ─────────────────────────────────────────────────────────────────────────────

function FormField({ label, name, register, errors, type = "number", step, hint }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={name} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {label}
            </label>
            {hint && <p className="text-xs text-zinc-500 dark:text-zinc-500">{hint}</p>}
            <input
                id={name}
                type={type}
                step={step || "any"}
                {...register(name, { valueAsNumber: true })}
                className={[
                    "h-10 w-full rounded-md border px-3 text-sm outline-none transition-colors",
                    "bg-white dark:bg-zinc-900",
                    "text-zinc-900 dark:text-zinc-100",
                    errors[name]
                        ? "border-red-400 focus:ring-2 focus:ring-red-400"
                        : "border-zinc-200 dark:border-zinc-700 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400/30 dark:focus:border-zinc-500",
                ].join(" ")}
            />
            {errors[name] && (
                <p className="text-xs text-red-500">{errors[name].message}</p>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente: Panel de progreso (barras animadas)
// ─────────────────────────────────────────────────────────────────────────────

function ProgressPanel({ progreso }) {
    const { status, dias_completados, max_dias, iteraciones_completadas, max_iteraciones } = progreso;

    const pctDias = max_dias > 0 ? Math.round((dias_completados / max_dias) * 100) : 0;
    const pctIter = max_iteraciones > 0 ? Math.round((iteraciones_completadas / max_iteraciones) * 100) : 0;

    const isDone = status === "done";
    const isError = status === "error";

    return (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
            <div className="flex items-center gap-2">
                {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : isError ? (
                    <span className="h-4 w-4 rounded-full bg-red-500 inline-block shrink-0" />
                ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-500 shrink-0" />
                )}
                <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                    {isDone
                        ? "Simulación Completada"
                        : isError
                        ? "Error en la Simulación"
                        : "Ejecutando Simulación…"}
                </h2>
            </div>

            {isError && (
                <p className="text-xs text-red-500">{progreso.error_detail ?? "Error desconocido."}</p>
            )}

            {/* Barra de Días */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                        <CalendarDays className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="font-medium">Días simulados</span>
                    </div>
                    <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                        {dias_completados} / {max_dias}
                    </span>
                </div>
                <Progress
                    value={pctDias}
                    indicatorClassName={isDone ? "bg-emerald-500" : undefined}
                />
                <p className="text-right text-xs text-zinc-400">{pctDias}%</p>
            </div>

            {/* Barra de Iteraciones */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                        <Zap className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="font-medium">Iteraciones acumuladas</span>
                    </div>
                    <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                        {iteraciones_completadas.toLocaleString()} / {max_iteraciones.toLocaleString()}
                    </span>
                </div>
                <Progress
                    value={pctIter}
                    indicatorClassName={isDone ? "bg-emerald-500" : undefined}
                />
                <p className="text-right text-xs text-zinc-400">{pctIter}%</p>
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal: Config
// ─────────────────────────────────────────────────────────────────────────────

export default function Config() {
    const navigate = useNavigate();
    const { setSimulationResult, setTotalDias, setGlobalStats, setLastRow } = useSimulation();
    const [loading, setLoading] = useState(false);
    const [progreso, setProgreso] = useState(null); // null = no hay simulación en curso

    const intervalRef = useRef(null);

    // Limpiar el intervalo al desmontar
    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const {
        register,
        handleSubmit,
        control,
        formState: { errors },
    } = useForm({ defaultValues: DEFAULT_VALUES });

    const stopPolling = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    };

    const onSubmit = async (data) => {
        setLoading(true);
        stopPolling();

        // Estado de progreso inicial (optimista mientras el POST responde)
        setProgreso({
            status: "running",
            dias_completados: 0,
            max_dias: data.max_dias,
            iteraciones_completadas: 0,
            max_iteraciones: data.max_iteraciones,
            error_detail: null,
        });

        // Excluir la seed (siempre fija internamente en el backend)
        const { master_seed: _removed, ...payload } = data;

        try {
            // Lanzar simulación — retorna { status: "started" } inmediatamente
            await simulationService.runSimulation(payload);

            // Iniciar polling cada 1.5 s
            intervalRef.current = setInterval(async () => {
                try {
                    const p = await simulationService.getProgreso();
                    setProgreso(p);

                    if (p.status === "done") {
                        stopPolling();

                        // Obtener estadísticas globales y guardar en contexto
                        const globalStats = await simulationService.getGlobalStats();
                        setGlobalStats(globalStats);

                        // Obtener datos del día 1 para la tabla
                        const dayData = await simulationService.getDayRecords(1, 0, 50);
                        setSimulationResult(dayData);

                        // Obtener total de días reales simulados
                        const allStats = await simulationService.getAllStats();
                        setTotalDias(allStats.total_dias);

                        // Obtener último registro (opcional)
                        try {
                            const ul = await simulationService.getUltimoRegistro();
                            setLastRow(ul.ultimo_registro);
                        } catch (_) { /* no crítico */ }

                        toast.success("¡Simulación concretada con éxito!", {
                            description: `${globalStats.total_dias ?? ""} días simulados en ${globalStats.tiempo_ejecucion ?? ""}`,
                        });

                        setLoading(false);
                        navigate("/stats");

                    } else if (p.status === "error") {
                        stopPolling();
                        toast.error("Error en la simulación", {
                            description: p.error_detail ?? "Error inesperado.",
                        });
                        setLoading(false);
                    }
                } catch (pollErr) {
                    console.error("Error en polling:", pollErr);
                }
            }, 1500);

        } catch (err) {
            stopPolling();
            setProgreso(null);
            const detail = err?.response?.data?.detail || "Error inesperado al iniciar la simulación.";
            toast.error("Error en la simulación", { description: detail });
            setLoading(false);
        }
    };

    return (
        <div className="mx-auto max-w-3xl">
            <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    Configuración de Simulación
                </h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Ajustá los parámetros y ejecutá una nueva simulación. Los valores por defecto replican las condiciones estándar del RTV.
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

                {/* === HORARIOS === */}
                <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                        Horarios de Operación
                    </h2>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <TimeRangeField
                            label="Hora de Apertura"
                            name="hora_apertura"
                            control={control}
                            errors={errors}
                        />
                        <TimeRangeField
                            label="Cierre de Puertas"
                            name="hora_cierre_puertas"
                            control={control}
                            errors={errors}
                        />
                    </div>
                </section>

                {/* === LLEGADAS === */}
                <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                        Tiempos de Llegada (minutos)
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField
                            label="Media Llegada Auto"
                            name="media_llegada_auto"
                            register={register}
                            errors={errors}
                            hint="Media exponencial entre llegadas de autos"
                        />
                        <FormField
                            label="Media Llegada Camioneta"
                            name="media_llegada_camioneta"
                            register={register}
                            errors={errors}
                            hint="Media exponencial entre llegadas de camionetas"
                        />
                    </div>
                </section>

                {/* === TIEMPOS DE SERVICIO === */}
                <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                        Tiempos de Servicio (minutos)
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField label="Frenos Mínimo" name="frenos_min" register={register} errors={errors} />
                        <FormField label="Frenos Máximo" name="frenos_max" register={register} errors={errors} />
                        <FormField label="Luces Mínimo" name="luces_min" register={register} errors={errors} />
                        <FormField label="Luces Máximo" name="luces_max" register={register} errors={errors} />
                    </div>
                </section>

                {/* === CONTROL DE SIMULACIÓN === */}
                <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                        Control de Simulación
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <FormField
                            label="Número de Líneas"
                            name="num_lineas"
                            register={register}
                            errors={errors}
                            step="1"
                        />
                        <FormField
                            label="Máximo de Días"
                            name="max_dias"
                            register={register}
                            errors={errors}
                            step="1"
                        />
                        <FormField
                            label="Máximo de Iteraciones"
                            name="max_iteraciones"
                            register={register}
                            errors={errors}
                            step="1"
                        />
                    </div>
                </section>

                {/* === PANEL DE PROGRESO === */}
                {progreso && <ProgressPanel progreso={progreso} />}

                {/* === BOTÓN SUBMIT === */}
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={loading}
                        className={[
                            "flex items-center gap-2 rounded-lg px-8 py-3 text-sm font-semibold transition-all",
                            "bg-zinc-900 text-white hover:bg-zinc-700 active:scale-[0.98]",
                            "dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
                            "disabled:cursor-not-allowed disabled:opacity-60",
                        ].join(" ")}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Ejecutando...
                            </>
                        ) : (
                            <>
                                <Play className="h-4 w-4" />
                                Ejecutar Simulación
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
