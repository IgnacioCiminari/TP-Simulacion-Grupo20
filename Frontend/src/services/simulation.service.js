import { api } from "./api";

/**
 * POST /simulacion
 * Lanza una nueva simulación en background.
 * Retorna { status: "started" } inmediatamente.
 */
const runSimulation = async (config = {}) => {
    const response = await api.post("/simulacion", config);
    return response.data;
};

/**
 * GET /simulacion/progreso
 * Devuelve el progreso actual de la simulación en curso.
 */
const getProgreso = async () => {
    const response = await api.get("/simulacion/progreso");
    return response.data;
};

/**
 * GET /estadisticas/top_bloqueo?n=N
 * Devuelve los top N días con mayor % de bloqueo de frenos.
 * Evita transferir el dataset completo para el gráfico de impacto.
 */
const getTopBloqueo = async (n = 10) => {
    const response = await api.get("/estadisticas/top_bloqueo", { params: { n } });
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
 * POST /simulacion/exportar
 * Genera y guarda el CSV del vector de estado completo en el servidor.
 */
const downloadCsv = async () => {
    const response = await api.post("/simulacion/exportar");
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

export default {
    runSimulation,
    getProgreso,
    getTopBloqueo,
    getDayRecords,
    getUltimoRegistro,
    getAllStats,
    getGlobalStats,
    downloadCsv,
    healthCheck,
};
