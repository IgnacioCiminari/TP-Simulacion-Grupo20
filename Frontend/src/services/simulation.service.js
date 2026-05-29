import { api } from "./api";

/**
 * POST /simulacion
 * Ejecuta una nueva simulación. Acepta params de configuración y paginación inicial.
 */
const runSimulation = async (config = {}, offset = 0, limit = 50) => {
    const response = await api.post("/simulacion", config, {
        params: { offset, limit },
    });
    return response.data;
};

/**
 * GET /simulacion
 * Consulta los registros paginados de un día específico.
 */
const getDayRecords = async (dia = 1, offset = 0, limit = 50) => {
    const response = await api.get("/simulacion", {
        params: { dia, offset, limit },
    });
    return response.data;
};

/**
 * GET /estadisticas
 * Devuelve estadísticas de todos los días para los gráficos.
 */
const getAllStats = async () => {
    const response = await api.get("/estadisticas");
    return response.data;
};

/**
 * GET /
 * Health check para verificar que el servidor esté corriendo.
 */
const healthCheck = async () => {
    const response = await api.get("/");
    return response.data;
};

export default { runSimulation, getDayRecords, getAllStats, healthCheck };