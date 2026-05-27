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

Ejecuta una nueva simulación multi-día con los parámetros indicados. **Importante:** Hacer esta petición borra de la memoria cualquier simulación que se haya ejecutado previamente.

La simulación se detiene cuando se cumple **cualquiera** de las dos condiciones de corte:
- Se completaron `max_dias` días.
- El total acumulado de iteraciones (filas del vector de estado) supera `max_iteraciones`.

En ambos casos, el día en curso siempre se completa antes de cortar.

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
    "max_dias": 10,
    "max_iteraciones": 1000
  }
  ```

- **Respuesta Exitosa (200 OK):**
  Devuelve las estadísticas del **Día 1** y los primeros registros paginados de ese día.

```json
{
  "dia": 1,
  "stats": {
    "dia": 1,
    "fin_jornada_min": 960.0,
    "fin_jornada_hhmm": "16:00",
    "promedio_espera_autos_min": 0.0407,
    "promedio_espera_camionetas_min": 0.2317,
    "autos_atendidos": 21,
    "camionetas_atendidas": 15,
    "porcentaje_bloqueo_frenos": {
      "1": 3.2059,
      "2": 0.0884
    }
  },
  "pagination": {
    "offset": 0,
    "limit": 50,
    "total_records": 120
  },
  "records": [
    {
      "Dia": "1",
      "Evento": "Inicialización",
      "Reloj_min": "480.00",
      "RND_Llegada_Auto": "0.4068",
      "Tiempo_Entre_Llegadas_Auto": "13.4908",
      "Prox_Llegada_Auto": "493.49",
      "Cola_Autos": "0",
      "Estado_Frenos_L1": "Libre",
      "Cant_Autos_Atendidos": "0",
      "Clientes_Activos": ""
    }
  ]
}
```

---

## 3. Consultar Registros de un Día

Devuelve una porción paginada de los registros del vector de estado del **día indicado**. Las estadísticas de ese día siempre se incluyen en la respuesta.

- **URL:** `/simulacion`
- **Método:** `GET`
- **Query Params:**
  - `dia` (integer): Número de jornada a consultar (default: `1`).
  - `offset` (integer): A partir de qué registro devolver (default: `0`).
  - `limit` (integer): Cuántos registros devolver (default: `50`).

- **Respuesta Exitosa (200 OK):**
  Mismo formato JSON que el endpoint `POST` mostrado arriba.

- **Respuesta de Error (404 Not Found):**
  Si no hay ninguna simulación ejecutada, o si el día solicitado no existe.
  ```json
  {
    "detail": "No hay ninguna simulación ejecutada. Realizá primero un POST /simulacion."
  }
  ```
  ```json
  {
    "detail": "El día 5 no existe en la simulación activa. Días disponibles: [1, 2, 3]."
  }
  ```

---

## 4. Estadísticas de Todos los Días

Devuelve un array con las estadísticas de cada jornada simulada. Diseñado para alimentar gráficos comparativos entre días.

- **URL:** `/estadisticas`
- **Método:** `GET`
- **No requiere parámetros.**

- **Respuesta Exitosa (200 OK):**

```json
{
  "total_dias": 3,
  "estadisticas": [
    {
      "dia": 1,
      "fin_jornada_min": 960.0,
      "fin_jornada_hhmm": "16:00",
      "promedio_espera_autos_min": 0.0407,
      "promedio_espera_camionetas_min": 0.2317,
      "autos_atendidos": 21,
      "camionetas_atendidas": 15,
      "porcentaje_bloqueo_frenos": {
        "1": 3.2059,
        "2": 0.0884
      }
    },
    {
      "dia": 2,
      "fin_jornada_min": 965.86,
      "fin_jornada_hhmm": "16:05",
      "promedio_espera_autos_min": 0.1040,
      "promedio_espera_camionetas_min": 0.7739,
      "autos_atendidos": 31,
      "camionetas_atendidas": 17,
      "porcentaje_bloqueo_frenos": {
        "1": 2.4578,
        "2": 1.5686
      }
    }
  ]
}
```

- **Respuesta de Error (404 Not Found):**
  Si intentás hacer un `GET` antes de haber hecho un `POST` inicial.
  ```json
  {
    "detail": "No hay ninguna simulación ejecutada. Realizá primero un POST /simulacion."
  }
  ```
