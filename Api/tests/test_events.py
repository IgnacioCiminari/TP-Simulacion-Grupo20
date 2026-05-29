"""
Tests de integración y comportamiento para los eventos de Frenos y Luces.
Verifica el bloqueo, desbloqueo y transferencia de vehículos entre estaciones.
"""

import pytest
from core.simulation import Simulation, SimulationConfig
from entities.vehicle import Vehicle, VehicleType, VehicleState
from entities.station import Station, StationType, StationStatus


def _make_config(**overrides) -> SimulationConfig:
    """Crea una configuración base con seed fija y jornada mínima."""
    defaults = dict(
        hora_apertura=0.0,
        hora_cierre_puertas=1.0,    # Cierra casi de inmediato
        master_seed=0,
    )
    defaults.update(overrides)
    return SimulationConfig(**defaults)


class TestStationBlocking:

    def test_station_blocks_when_luces_busy(self):
        """
        Cuando Luces está ocupada al finalizar Frenos, la estación de Frenos
        debe quedar en estado BLOQUEADO y el vehículo permanece en ella.
        """
        from entities.station import Station, StationType
        from entities.line import InspectionLine

        frenos = Station(StationType.FRENOS, line_id=1)
        luces = Station(StationType.LUCES, line_id=1)
        line = InspectionLine(id=1, frenos=frenos, luces=luces)

        v1 = Vehicle(id=1, tipo=VehicleType.AUTO, hora_llegada=0.0)
        v2 = Vehicle(id=2, tipo=VehicleType.AUTO, hora_llegada=0.0)

        frenos.start_service(v1, clock=0.0, fin=5.0)
        luces.start_service(v2, clock=0.0, fin=10.0)

        vehicle_done = frenos.finish_service(clock=5.0)
        assert vehicle_done is v1

        v1.hora_inicio_bloqueo = 5.0
        frenos.current_vehicle = v1
        frenos.set_blocked(clock=5.0)

        assert frenos.is_blocked(), "Frenos debería estar BLOQUEADO."
        assert frenos.current_vehicle is v1, "v1 debe permanecer en Frenos bloqueado."

    def test_unblock_on_luces_free(self):
        """
        Al liberarse Luces, el vehículo bloqueado en Frenos debe desplazarse
        a Luces y Frenos debe quedar libre.
        """
        from entities.station import Station, StationType
        from entities.line import InspectionLine

        frenos = Station(StationType.FRENOS, line_id=1)
        luces = Station(StationType.LUCES, line_id=1)

        v1 = Vehicle(id=1, tipo=VehicleType.AUTO, hora_llegada=0.0)
        v2 = Vehicle(id=2, tipo=VehicleType.AUTO, hora_llegada=0.0)

        luces.start_service(v2, clock=0.0, fin=10.0)
        frenos.start_service(v1, clock=0.0, fin=5.0)
        frenos.finish_service(clock=5.0)
        frenos.current_vehicle = v1
        frenos.set_blocked(clock=5.0)

        _ = luces.finish_service(clock=10.0)
        luces.set_free()

        assert frenos.is_blocked(), "Frenos sigue bloqueado antes del desbloqueo explícito."

        blocked = frenos.unblock(clock=10.0)

        assert blocked is v1, "El vehículo desbloqueado debe ser v1."
        assert frenos.is_free(), "Frenos debe quedar libre después del desbloqueo."
        assert luces.is_free(), "Luces debe estar libre."
        assert frenos.total_blocked_time() == pytest.approx(5.0), (
            "El tiempo de bloqueo acumulado debe ser 5 min."
        )

    def test_vehicle_goes_to_luces_directly_if_free(self):
        """
        Si Luces está libre cuando Frenos termina, el vehículo debe pasar
        directamente a Luces sin bloqueo.
        """
        from entities.station import Station, StationType
        from entities.line import InspectionLine

        frenos = Station(StationType.FRENOS, line_id=1)
        luces = Station(StationType.LUCES, line_id=1)

        v = Vehicle(id=1, tipo=VehicleType.AUTO, hora_llegada=0.0)
        frenos.start_service(v, clock=0.0, fin=5.0)

        done = frenos.finish_service(clock=5.0)
        assert luces.is_free()

        luces.start_service(done, clock=5.0, fin=13.0)

        assert luces.is_busy()
        assert luces.current_vehicle is v
        assert not frenos.is_blocked()


class TestFullSimulation:

    def test_simulation_runs_without_error(self):
        """La simulación debe completar sin lanzar excepciones y devolver resultados."""
        config = SimulationConfig(master_seed=123)
        sim = Simulation(config)
        results, global_stats = sim.run()

        assert len(results) > 0
        assert results[0].tracker.fin_jornada is not None
        assert results[0].tracker.fin_jornada >= config.hora_cierre_puertas

    def test_vehicles_counted_are_positive(self):
        """Deben haberse atendido vehículos en una jornada completa."""
        config = SimulationConfig(master_seed=7)
        sim = Simulation(config)
        results, global_stats = sim.run()

        assert global_stats.total_autos_atendidos > 0
        assert global_stats.total_camionetas_atendidas > 0

    def test_average_waits_are_non_negative(self):
        """Los tiempos de espera promedio globales no pueden ser negativos."""
        config = SimulationConfig(master_seed=99)
        sim = Simulation(config)
        _, global_stats = sim.run()

        assert global_stats.promedio_espera_autos >= 0.0
        assert global_stats.promedio_espera_camionetas >= 0.0

    def test_block_percentages_between_0_and_100(self):
        """Los porcentajes de bloqueo deben estar entre 0% y 100%."""
        config = SimulationConfig(master_seed=55)
        sim = Simulation(config)
        results, _ = sim.run()

        for day_result in results:
            for lid in range(1, config.num_lineas + 1):
                pct = day_result.tracker.porcentaje_bloqueo_frenos(lid)
                assert 0.0 <= pct <= 100.0, f"Porcentaje de bloqueo L{lid} fuera de rango: {pct}"

    def test_determinism_with_same_seed(self):
        """
        Dos simulaciones con la misma seed deben producir resultados idénticos.
        """
        def run_sim(seed: int) -> tuple:
            config = SimulationConfig(master_seed=seed)
            sim = Simulation(config)
            results, global_stats = sim.run()
            return (
                results[0].tracker.fin_jornada,
                global_stats.total_autos_atendidos,
                global_stats.total_camionetas_atendidas,
                round(global_stats._total_espera_autos, 6),
            )

        r1 = run_sim(42)
        r2 = run_sim(42)
        assert r1 == r2, "Las simulaciones con la misma seed deben ser idénticas."

    def test_different_seeds_different_results(self):
        """
        Dos simulaciones con seeds distintas deben producir al menos un resultado diferente.
        """
        def run_sim(seed: int) -> float:
            config = SimulationConfig(master_seed=seed)
            sim = Simulation(config)
            results, _ = sim.run()
            return results[0].tracker.fin_jornada

        r1 = run_sim(1)
        r2 = run_sim(9999)
        assert r1 != r2, "Seeds distintas deberían producir jornadas distintas."

    def test_iteration_ids_are_sequential(self):
        """La columna Iteracion debe ser un entero incremental positivo."""
        config = SimulationConfig(master_seed=42, max_dias=2, max_iteraciones=500)
        sim = Simulation(config)
        results, _ = sim.run()

        all_rows = []
        for dr in results:
            all_rows.extend(dr.rows)

        ids = [int(r["Iteracion"]) for r in all_rows]
        assert ids == list(range(1, len(ids) + 1)), "Las iteraciones deben ser consecutivas."

    def test_last_row_is_accessible(self):
        """El exporter debe exponer el último row generado."""
        config = SimulationConfig(master_seed=42)
        sim = Simulation(config)
        sim.run()

        assert sim.exporter.last_row is not None
        assert "Iteracion" in sim.exporter.last_row
