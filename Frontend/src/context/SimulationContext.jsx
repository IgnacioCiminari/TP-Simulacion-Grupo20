import { createContext, useContext, useState } from "react";

const SimulationContext = createContext(null);

export function SimulationProvider({ children }) {
    // Datos de la última simulación ejecutada
    const [simulationResult, setSimulationResult] = useState(null);
    // Número total de días simulados (derivado del GET /estadisticas)
    const [totalDias, setTotalDias] = useState(null);

    return (
        <SimulationContext.Provider
            value={{
                simulationResult,
                setSimulationResult,
                totalDias,
                setTotalDias,
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
