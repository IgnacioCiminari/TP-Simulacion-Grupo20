import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
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
    master_seed: 42,
    max_dias: 10,
    max_iteraciones: 1000,
};

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

export default function Config() {
    const navigate = useNavigate();
    const { setSimulationResult, setTotalDias } = useSimulation();
    const [loading, setLoading] = useState(false);

    const {
        register,
        handleSubmit,
        getValues,
        formState: { errors },
    } = useForm({ defaultValues: DEFAULT_VALUES });

    const onSubmit = async (data) => {
        setLoading(true);
        try {
            const result = await simulationService.runSimulation(data);
            setSimulationResult(result);
            // max_dias es el límite configurado; el real se actualiza al entrar a gráficos
            setTotalDias(data.max_dias);
            toast.success("¡Simulación concretada con éxito!", {
                description: `Día 1 listo · ${result.stats?.autos_atendidos ?? 0} autos · ${result.stats?.camionetas_atendidas ?? 0} camionetas atendidas`,
            });
            navigate("/table");
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField
                            label="Hora de Apertura"
                            name="hora_apertura"
                            register={register}
                            errors={errors}
                            hint="Minutos desde medianoche (480 = 08:00)"
                        />
                        <FormField
                            label="Cierre de Puertas"
                            name="hora_cierre_puertas"
                            register={register}
                            errors={errors}
                            hint="Minutos desde medianoche (960 = 16:00)"
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
                        <FormField
                            label="Frenos Mínimo"
                            name="frenos_min"
                            register={register}
                            errors={errors}
                        />
                        <FormField
                            label="Frenos Máximo"
                            name="frenos_max"
                            register={register}
                            errors={errors}
                        />
                        <FormField
                            label="Luces Mínimo"
                            name="luces_min"
                            register={register}
                            errors={errors}
                        />
                        <FormField
                            label="Luces Máximo"
                            name="luces_max"
                            register={register}
                            errors={errors}
                        />
                    </div>
                    {/* Validación cruzada min/max */}
                    {errors._cross && (
                        <p className="mt-3 text-xs text-red-500">{errors._cross.message}</p>
                    )}
                </section>

                {/* === CONTROL DE SIMULACIÓN === */}
                <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                        Control de Simulación
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <FormField
                            label="Número de Líneas"
                            name="num_lineas"
                            register={register}
                            errors={errors}
                            step="1"
                            hint="Servidores paralelos"
                        />
                        <FormField
                            label="Master Seed"
                            name="master_seed"
                            register={register}
                            errors={errors}
                            step="1"
                            hint="Semilla aleatoria"
                        />
                        <FormField
                            label="Máximo de Días"
                            name="max_dias"
                            register={register}
                            errors={errors}
                            step="1"
                            hint="Condición de corte 1"
                        />
                        <FormField
                            label="Máximo de Iteraciones"
                            name="max_iteraciones"
                            register={register}
                            errors={errors}
                            step="1"
                            hint="Condición de corte 2"
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
