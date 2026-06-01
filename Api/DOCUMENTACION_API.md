# Documentación de la API de Simulación RTV — v4.0

La API está construida con **FastAPI**. Por defecto corre en `http://127.0.0.1:8000`.
Podés acceder a la documentación interactiva (Swagger) en `http://127.0.0.1:8000/docs`.

> **Nota**: La semilla de aleatoriedad (`master_seed`) es gestionada internamente por la API y **no se expone al usuario**.

---

## Flujo general

```
POST /simulacion          → { status: "started" }  (respuesta inmediata)
GET  /simulacion/progreso → polling hasta { status: "done" }
GET  /estadisticas_globales → estadísticas totales de la simulación
GET  /simulacion          → registros paginados de un día
GET  /estadisticas/top_bloqueo?n=10 → top N días para el gráfico de bloqueo
```

---

## 1. Health Check

- **URL:** `GET /`
- **Descripción:** Verifica que el servidor esté operativo.

```json
{ "status": "online", "message": "API de Simulación RTV corriendo correctamente en el puerto 8000." }
```

---

## 2. Lanzar Simulación (Asincrónico)

- **URL:** `POST /simulacion`
- **Descripción:** Lanza la simulación en un thread de fondo y retorna **inmediatamente**. La simulación corre en paralelo; consultá el progreso en `GET /simulacion/progreso`.

**Condiciones de corte** (se detiene cuando se cumple *cualquiera*):
- `max_dias` días completados.
- `max_iteraciones` iteraciones (filas del vector de estado) acumuladas.

**Body (JSON, opcional):** — Si no se envía, usa los valores por defecto.
```json
{
  "hora_apertura": 480.0,
  "hora_cierre_puertas": 960.0,
  "media_llegada_auto": 15.0,
  "media_llegada_camioneta": 30.0,
  "frenos_min": 4.0,
  "frenos_max": 7.0,
  "luces_min": 6.0,
  "luces_max": 10.0,
  "num_lineas": 2,
  "max_dias": 10,
  "max_iteraciones": 1000
}
```

**Respuesta Exitosa (200 OK):**
```json
{ "status": "started" }
```

---

## 3. Progreso de la Simulación

- **URL:** `GET /simulacion/progreso`
- **Descripción:** Devuelve el estado de avance de la simulación en curso (o de la última ejecutada). Diseñado para polling periódico (cada 1–2 s) desde el frontend.

**Respuesta:**
```json
{
  "status": "running",
  "dias_completados": 4,
  "max_dias": 10,
  "iteraciones_completadas": 487,
  "max_iteraciones": 1000,
  "error_detail": null
}
```

**Valores de `status`:**

| Valor | Descripción |
|-------|-------------|
| `idle` | No se ejecutó ninguna simulación aún. |
| `running` | Simulación en progreso. |
| `done` | Finalizada correctamente. Los demás endpoints están disponibles. |
| `error` | Falló. El detalle del error está en `error_detail`. |

---

## 4. Consultar Registros de un Día

- **URL:** `GET /simulacion`
- **Query Params:**
  - `dia` (int, default: 1): Jornada a consultar.
  - `offset` (int, default: 0): Registro inicial de la página.
  - `limit` (int, default: 50): Tamaño de página.

**Respuesta Exitosa (200 OK):**
```json
{
  "dia": 1,
  "stats": { "dia": 1, "fin_jornada_min": 960.0, "..." },
  "pagination": { "offset": 0, "limit": 50, "total_records": 120 },
  "records": [ { "Iteracion": "1", "Dia": "1", "Evento": "Inicialización", "..." } ]
}
```

---

## 5. Último Registro de la Simulación

- **URL:** `GET /simulacion/ultimo_registro`
- **Descripción:** Devuelve el último evento registrado en toda la simulación (útil para la fila sticky de la tabla del front).

```json
{ "ultimo_registro": { "Iteracion": "1205", "Dia": "10", "Evento": "Fin Atencion Luces", "..." } }
```

---

## 6. Exportar CSV

- **URL:** `POST /simulacion/exportar`
- **Descripción:** Genera el CSV completo del vector de estado (todos los días) y lo guarda directamente en el servidor en la ruta `output/vector_de_estado.csv`. La carpeta `output/` se crea automáticamente si no existe. No inicia ninguna descarga en el navegador.
- **Respuesta Exitosa (200 OK):**

```json
{
  "status": "success",
  "message": "CSV guardado exitosamente en output/vector_de_estado.csv"
}
```

> **Docker:** El directorio `output/` del contenedor está montado como volumen (`./Api/output:/app/output`), por lo que el archivo queda accesible directamente desde el host en `Api/output/vector_de_estado.csv`.

---

## 7. Estadísticas por Día (dataset completo)

- **URL:** `GET /estadisticas`
- **Descripción:** Array con las estadísticas de **todas** las jornadas simuladas. Incluye `max_cola`, `porcentaje_bloqueo_frenos` dinámico por línea, tiempos de servicio, etc. Usado para los gráficos de productividad e histograma de cierre.

```json
{
  "total_dias": 10,
  "estadisticas": [
    {
      "dia": 1,
      "fin_jornada_min": 960.0,
      "fin_jornada_hhmm": "16:00",
      "autos_atendidos": 21,
      "camionetas_atendidas": 15,
      "max_cola": 4,
      "promedio_espera_autos_min": 0.0407,
      "promedio_espera_camionetas_min": 0.2317,
      "porcentaje_bloqueo_frenos": { "1": 3.2059, "2": 0.0884 },
      "servicio_frenos_min": { "1": 25.4, "2": 30.1 },
      "servicio_luces_min": { "1": 40.2, "2": 45.5 },
      "total_servicio_min": { "1": 65.6, "2": 75.6 }
    }
  ]
}
```

---

## 8. Top N Días por Bloqueo de Frenos

- **URL:** `GET /estadisticas/top_bloqueo`
- **Query Params:**
  - `n` (int, default: 10, min: 1, max: 100): Cantidad de días a devolver.
- **Descripción:** Devuelve los **N días con mayor suma de porcentaje de bloqueo de frenos** entre todas las líneas, ordenados de mayor a menor. Permite al frontend traer solo los datos necesarios para el gráfico de impacto sin transferir el dataset completo.

```json
{
  "total_dias": 100,
  "n": 10,
  "estadisticas": [
    { "dia": 7, "porcentaje_bloqueo_frenos": { "1": 8.4, "2": 3.1 }, "..." },
    { "dia": 23, "..." }
  ]
}
```

---

## 9. Estadísticas Globales

- **URL:** `GET /estadisticas_globales`
- **Descripción:** Estadísticas agregadas de toda la simulación activa, sin necesidad de re-ejecutar. Disponible cuando `GET /simulacion/progreso` devuelve `status: "done"`.

```json
{
  "total_dias": 10,
  "total_autos_atendidos": 230,
  "total_camionetas_atendidas": 145,
  "promedio_espera_autos_min": 0.0812,
  "promedio_espera_camionetas_min": 0.3471,
  "promedio_fin_jornada_min": 962.43,
  "promedio_fin_jornada_hhmm": "16:02",
  "porcentaje_bloqueo_global": { "1": 2.8412, "2": 0.9231 },
  "tiempo_ejecucion": "0.43 s"
}
```

---

## Errores Comunes

| Código | Descripción |
|--------|-------------|
| `404`  | No hay simulación activa. Ejecutar primero `POST /simulacion` y esperar `status: "done"`. |
| `404`  | El día solicitado no existe. Ver `detail` para los días disponibles. |
| `500`  | Error interno del servidor. Ver logs del servidor. |

---

## Tabla de Endpoints

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET`  | `/` | Health check |
| `POST` | `/simulacion` | Lanza simulación en background |
| `GET`  | `/simulacion/progreso` | Estado de avance (polling) |
| `GET`  | `/simulacion` | Registros paginados de un día |
| `GET`  | `/simulacion/ultimo_registro` | Último evento registrado |
| `POST` | `/simulacion/exportar` | Guarda CSV en `output/vector_de_estado.csv` |
| `GET`  | `/estadisticas` | Estadísticas de todos los días |
| `GET`  | `/estadisticas/top_bloqueo` | Top N días por bloqueo |
| `GET`  | `/estadisticas_globales` | Estadísticas globales agregadas |
