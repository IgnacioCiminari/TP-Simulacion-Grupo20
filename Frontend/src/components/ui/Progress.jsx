/**
 * Progress — componente estilo shadcn/ui construido con Tailwind puro.
 * Acepta un `value` entre 0 y 100 y renderiza una barra de progreso accesible.
 */
import { cn } from "../../lib/utils";

export function Progress({ value = 0, className, indicatorClassName, ...props }) {
    const pct = Math.min(100, Math.max(0, value ?? 0));

    return (
        <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className={cn(
                "relative h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800",
                className,
            )}
            {...props}
        >
            <div
                className={cn(
                    "h-full rounded-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-500 ease-out",
                    indicatorClassName,
                )}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}
