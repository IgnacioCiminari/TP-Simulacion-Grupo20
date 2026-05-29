import { api } from "./api";

/**
 * POST /simulacion
 * Ejecuta una nueva simulación. Acepta params de configuración y paginación inicial.
 * Devuelve estadísticas globales, registros del día 1 y último registro.
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
 * GET /simulacion/ultimo_registro
 * Devuelve el último registro de la simulación activa.
 */
const getUltimoRegistro = async () => {
    const response = await api.get("/simulacion/ultimo_registro");
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
 * GET /estadisticas_globales
 * Devuelve las estadísticas globales de la simulación activa.
 */
const getGlobalStats = async () => {
    const response = await api.get("/estadisticas_globales");
    return response.data;
};

/**
 * GET /simulacion/exportar
 * Descarga el CSV del vector de estado completo.
 */
const downloadCsv = () => {
    // Abrir en nueva ventana/pestaña para que el browser dispare la descarga
    window.open(`${api.defaults.baseURL}/simulacion/exportar`, "_blank");
};

/**
 * GET /
 * Health check para verificar que el servidor esté corriendo.
 */
const healthCheck = async () => {
    const response = await api.get("/");
    return response.data;
};

export default {
    runSimulation,
    getDayRecords,
    getUltimoRegistro,
    getAllStats,
    getGlobalStats,
    downloadCsv,
    healthCheck,
};