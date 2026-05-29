import { createContext, useContext, useState } from "react";

const SimulationContext = createContext(null);

export function SimulationProvider({ children }) {
    // Datos del día 1 de la última simulación (para la tabla)
    const [simulationResult, setSimulationResult] = useState(null);
    // Estadísticas globales de la última simulación (para la página Estadísticas)
    const [globalStats, setGlobalStats] = useState(null);
    // Número total de días simulados
    const [totalDias, setTotalDias] = useState(null);
    // Último registro generado en toda la simulación (para sticky row de la tabla)
    const [lastRow, setLastRow] = useState(null);

    return (
        <SimulationContext.Provider
            value={{
                simulationResult,
                setSimulationResult,
                globalStats,
                setGlobalStats,
                totalDias,
                setTotalDias,
                lastRow,
                setLastRow,
            }}
        >
            {children}
        </SimulationContext.Provider>
    );
}

export function useSimulation() {
    const ctx = useContext(SimulationContext);
    if (!ctx) throw new Error("useSimulation debe usarse dentro de SimulationProvider");
    return ctx;
}
