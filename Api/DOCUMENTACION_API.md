# Documentación de la API de Simulación RTV

La API está construida con FastAPI. Por defecto corre en `http://127.0.0.1:8000`.
Además de esta guía, podés acceder a la documentación interactiva (Swagger) entrando a `http://127.0.0.1:8000/docs` desde tu navegador mientras el servidor está corriendo.

---

## 1. Health Check

Verifica que el servidor esté levantado.

- **URL:** `/`
- **Método:** `GET`
- **Respuesta Exitosa (200 OK):**

```json
{
  "status": "online",
  "message": "API de Simulación RTV corriendo correctamente en el puerto 8000."
}
```

---

## 2. Ejecutar Simulación

Ejecuta una nueva simulación con los parámetros indicados. **Importante:** Hacer esta petición borra de la memoria cualquier simulación que se haya ejecutado previamente.

- **URL:** `/simulacion`
- **Método:** `POST`
- **Query Params (Opcionales):**
  - `offset` (integer): A partir de qué registro devolver (default: `0`).
  - `limit` (integer): Cuántos registros devolver (default: `50`).
- **Body (JSON, Opcional):**
  Si no se envía, usa los valores por defecto.
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
    "master_seed": 42,
    "run_index": 1
  }
  ```

- **Respuesta Exitosa (200 OK):**

```json
{
  "stats": {
    "fin_jornada_min": 965.23,
    "fin_jornada_hhmm": "16:05",
    "promedio_espera_autos_min": 12.3456,
    "promedio_espera_camionetas_min": 8.7654,
    "autos_atendidos": 35,
    "camionetas_atendidas": 18,
    "porcentaje_bloqueo_frenos": {
      "1": 15.23,
      "2": 10.45
    }
  },
  "pagination": {
    "offset": 0,
    "limit": 50,
    "total_records": 1205
  },
  "records": [
    {
      "Evento": "Inicialización",
      "Reloj_min": "480.00",
      "RND_Llegada_Auto": "0.1234",
      "Tiempo_Entre_Llegadas_Auto": "12.50",
      "Prox_Llegada_Auto": "492.50",
      "Cola_Camionetas": "0",
      "Estado_Frenos_L1": "Libre",
      "Cant_Autos_Atendidos": "0",
      "Tiempo_Espera_Auto": "",
      "Tiempo_Bloqueo_L1": "",
      "Clientes_Activos": ""
    }
  ]
}
```

---

## 3. Consultar Simulación Activa

Devuelve una porción paginada de los registros de la **última simulación ejecutada** (la que está guardada en memoria). Las estadísticas de resumen se incluyen siempre en la respuesta, sin importar qué porción (`offset`/`limit`) se pida.

- **URL:** `/simulacion`
- **Método:** `GET`
- **Query Params:**
  - `offset` (integer): A partir de qué registro devolver (default: `0`).
  - `limit` (integer): Cuántos registros devolver (default: `50`).

- **Respuesta Exitosa (200 OK):**
  Mismo formato JSON que el endpoint `POST` mostrado arriba.

- **Respuesta de Error (404 Not Found):**
  Si intentás hacer un `GET` antes de haber hecho un `POST` inicial (es decir, la memoria está vacía).
  ```json
  {
    "detail": "No hay ninguna simulación ejecutada. Realizá primero un POST /simulacion."
  }
  ```
