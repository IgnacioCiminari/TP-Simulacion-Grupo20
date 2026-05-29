"""
Punto de entrada de la simulación de la Planta de Revisión Técnica Vehicular.

Uso:
    uv run main.py

Para modificar parámetros, editar el objeto SimulationConfig a continuación.
"""

from core.simulation import Simulation, SimulationConfig


def main() -> None:
    config = SimulationConfig(
        # ── Horario de la jornada ──────────────────────────────────────────────
        hora_apertura=480.0,           # 08:00 hs en minutos
        hora_cierre_puertas=960.0,     # 16:00 hs en minutos

        # ── Tasas de llegada (distribución exponencial, parámetro = media) ────
        media_llegada_auto=15.0,       # minutos entre llegadas de autos
        media_llegada_camioneta=30.0,  # minutos entre llegadas de camionetas

        # ── Tiempos de servicio (distribución uniforme) ────────────────────────
        frenos_min=4.0,
        frenos_max=7.0,
        luces_min=6.0,
        luces_max=10.0,

        # ── Infraestructura ───────────────────────────────────────────────────
        num_lineas=2,

        # ── Salida ────────────────────────────────────────────────────────────
        csv_output_path="output/vector_de_estado.csv",

        # ── Reproducibilidad ──────────────────────────────────────────────────
        # master_seed=None para comportamiento no determinístico.
        master_seed=42,

        # ── Condiciones de corte (se detiene al cumplirse CUALQUIERA) ─────────
        max_dias=10,           # número máximo de días a simular
        max_iteraciones=1_000, # umbral de iteraciones totales acumuladas
    )

    print(
        f"Iniciando simulación (seed maestra={config.master_seed}, "
        f"max_dias={config.max_dias}, max_iteraciones={config.max_iteraciones})..."
    )

    sim = Simulation(config)
    results = sim.run()

    for day_result in results:
        print(f"\n{'=' * 60}")
        print(f"  DÍA {day_result.dia}")
        print(day_result.tracker.report_cached())

    print(f"\nTotal de días simulados: {len(results)}")
    print(f"Vector de estado guardado en: {config.csv_output_path}")


if __name__ == "__main__":
    main()
