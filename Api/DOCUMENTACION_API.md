# Documentación de la API de Simulación RTV — v3.0

La API está construida con **FastAPI**. Por defecto corre en `http://127.0.0.1:8000`.
Podés acceder a la documentación interactiva (Swagger) en `http://127.0.0.1:8000/docs`.

> **Nota**: La semilla de aleatoriedad (`master_seed`) es gestionada internamente por la API y **no se expone al usuario**.

---

## 1. Health Check

- **URL:** `GET /`
- **Descripción:** Verifica que el servidor esté operativo.

```json
{ "status": "online", "message": "API de Simulación RTV corriendo correctamente en el puerto 8000." }
```

---

## 2. Ejecutar Simulación

- **URL:** `POST /simulacion`
- **Descripción:** Crea y ejecuta una simulación multi-día. Reemplaza cualquier simulación anterior en memoria. **No escribe archivos a disco** — todo se guarda en RAM.

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
{
  "dia": 1,
  "stats": {
    "dia": 1,
    "fin_jornada_min": 960.0,
    "fin_jornada_hhmm": "16:00",
    "autos_atendidos": 21,
    "camionetas_atendidas": 15,
    "max_cola": 4,
    "porcentaje_bloqueo_frenos": { "1": 3.2059, "2": 0.0884 }
  },
  "pagination": { "offset": 0, "limit": 50, "total_records": 120 },
  "records": [ { "Iteracion": "1", "Dia": "1", "Evento": "Inicialización", "Reloj_min": "480.00", "..." } ],
  "total_dias_simulados": 10,
  "estadisticas_globales": {
    "total_dias": 10,
    "total_autos_atendidos": 230,
    "total_camionetas_atendidas": 145,
    "promedio_espera_autos_min": 0.0812,
    "promedio_espera_camionetas_min": 0.3471,
    "promedio_fin_jornada_min": 962.43,
    "promedio_fin_jornada_hhmm": "16:02",
    "porcentaje_bloqueo_global": { "1": 2.8412, "2": 0.9231 },
    "tiempo_ejecucion": "0.43 s"
  },
  "ultimo_registro": { "Iteracion": "1205", "Dia": "10", "Evento": "Fin Atencion Luces", "..." }
}
```

---

## 3. Consultar Registros de un Día

- **URL:** `GET /simulacion`
- **Query Params:**
  - `dia` (int, default: 1): Jornada a consultar.
  - `offset` (int, default: 0): Registro inicial de la página.
  - `limit` (int, default: 50): Tamaño de página.

**Respuesta Exitosa (200 OK):** Igual a la respuesta del `POST` (sin `estadisticas_globales` ni `ultimo_registro`).

---

## 4. Último Registro de la Simulación

- **URL:** `GET /simulacion/ultimo_registro`
- **Descripción:** Devuelve el último evento registrado en toda la simulación (útil para la fila sticky de la tabla del front).

```json
{ "ultimo_registro": { "Iteracion": "1205", "Dia": "10", "Evento": "Fin Atencion Luces", "..." } }
```

---

## 5. Exportar CSV

- **URL:** `GET /simulacion/exportar`
- **Descripción:** Genera y descarga el CSV completo del vector de estado desde la memoria RAM. Incluye todas las columnas (incluyendo `Iteracion`) para todas las jornadas simuladas.
- **Respuesta:** `text/csv` con `Content-Disposition: attachment; filename=vector_de_estado.csv`. Codificado en UTF-8 con BOM para compatibilidad con Excel.

---

## 6. Estadísticas por Día (para Gráficos)

- **URL:** `GET /estadisticas`
- **Descripción:** Array con las estadísticas de cada jornada. Incluye `max_cola` (longitud máxima de cola del día) y `porcentaje_bloqueo_frenos` dinámico por línea.

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
      "porcentaje_bloqueo_frenos": { "1": 3.2059, "2": 0.0884 }
    }
  ]
}
```

---

## 7. Estadísticas Globales

- **URL:** `GET /estadisticas_globales`
- **Descripción:** Estadísticas agregadas de toda la simulación activa, sin necesidad de re-ejecutar. Disponible inmediatamente tras ejecutar un `POST /simulacion`.

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
| `404`  | No hay simulación activa. Ejecutar primero `POST /simulacion`. |
| `404`  | El día solicitado no existe. Ver `detail` para los días disponibles. |
| `500`  | Error interno del servidor. Ver logs del servidor. |
