import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, Play } from "lucide-react";
import { useSimulation } from "../context/SimulationContext";
import simulationService from "../services/simulation.service";

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
    max_dias: 10,
    max_iteraciones: 1000,
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
// Página principal: Config
// ─────────────────────────────────────────────────────────────────────────────

export default function Config() {
    const navigate = useNavigate();
    const { setSimulationResult, setTotalDias, setGlobalStats, setLastRow } = useSimulation();
    const [loading, setLoading] = useState(false);

    const {
        register,
        handleSubmit,
        control,
        formState: { errors },
    } = useForm({ defaultValues: DEFAULT_VALUES });

    const onSubmit = async (data) => {
        setLoading(true);
        // Excluir la seed (siempre fija internamente en el backend)
        const { master_seed: _removed, ...payload } = data;
        try {
            const result = await simulationService.runSimulation(payload);
            // Guardar datos del día 1 en el contexto (para la Tabla)
            setSimulationResult(result);
            // Guardar cantidad real de días simulados
            setTotalDias(result.total_dias_simulados);
            // Guardar estadísticas globales (para la página Estadísticas)
            setGlobalStats(result.estadisticas_globales);
            // Guardar último registro (para sticky row de la Tabla)
            setLastRow(result.ultimo_registro);

            toast.success("¡Simulación concretada con éxito!", {
                description: `${result.estadisticas_globales?.total_dias ?? ""} días simulados en ${result.estadisticas_globales?.tiempo_ejecucion ?? ""}`,
            });
            navigate("/stats");
        } catch (err) {
            const detail = err?.response?.data?.detail || "Error inesperado al ejecutar la simulación.";
            toast.error("Error en la simulación", { description: detail });
        } finally {
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
