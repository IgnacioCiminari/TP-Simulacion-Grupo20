# TP4 - Simulación Planta de Revisión Técnica Vehicular

**Asignatura:** Simulación — UTN FRBA  
**Grupo:** 20

---

## Descripción del Problema

Se modela la operación diaria de una planta de Revisión Técnica Vehicular (RTV) que atiende autos y camionetas desde las **08:00** hasta las **16:00** hs. La planta cuenta con dos líneas de inspección secuenciales (Frenos → Luces y Emisiones). Las camionetas tienen prioridad de atención sobre los autos. Si la estación de Luces está ocupada al terminar Frenos, la estación de Frenos queda **bloqueada** hasta que Luces se libere.

**Objetivos de la simulación:**
- Tiempo promedio de espera en la cola de ingreso para autos y camionetas.
- Porcentaje de tiempo que la estación de Frenos estuvo bloqueada (por línea).
- Hora real de finalización de la jornada (cuándo sale el último vehículo).

---

## Estructura del Proyecto

```
tp4_simulacion/
│
├── main.py                    # Punto de entrada. Configurar parámetros aquí.
├── api.py                     # API REST (FastAPI). Levantar con uvicorn.
├── pyproject.toml             # Configuración del proyecto (uv)
│
├── core/                      # Motor de simulación (DES)
│   ├── event.py               # Clase abstracta Event
│   ├── fel.py                 # Future Event List (heap de prioridad)
│   ├── rng.py                 # Generador de números pseudoaleatorios con traza de RND
│   ├── simulation.py          # Clase Simulation: bucle principal multi-día, RNG, config
│   └── state.py               # Vector de estado global (SimulationState)
│
├── entities/                  # Entidades del dominio
│   ├── vehicle.py             # Vehículo (Auto / Camioneta) con atributos de timing
│   ├── station.py             # Estación de servicio (Frenos / Luces)
│   ├── line.py                # Línea de inspección (Frenos + Luces secuenciales)
│   └── queue.py               # Cola con prioridad (Camionetas > Autos, FIFO dentro de cada tipo)
│
├── events/                    # Implementaciones de cada evento
│   ├── llegada_auto.py        # Llegada de un automóvil
│   ├── llegada_camioneta.py   # Llegada de una camioneta
│   ├── fin_frenos.py          # Fin de revisión en estación de Frenos
│   ├── fin_luces.py           # Fin de revisión en estación de Luces (vehículo sale del sistema)
│   ├── cierre_puertas.py      # Cierre de puertas a las 16:00 hs
│   └── _routing.py            # Helper interno de ruteo compartido entre eventos de llegada
│
├── stats/                     # Estadísticas y exportación
│   ├── tracker.py             # StatsTracker: promedios, porcentajes, hora de cierre
│   └── exporter.py            # MemoryExporter: genera el vector de estado en CSV en memoria
│
└── tests/                     # Suite de tests (pytest)
    ├── test_queue.py          # Tests unitarios de la cola con prioridad
    └── test_events.py         # Tests de bloqueo, desbloqueo y simulación completa
```

---

## Cómo Ejecutar

### 1. Prerrequisitos

Tener instalado [**uv**](https://docs.astral.sh/uv/). Si no lo tenés:

```powershell
pip install uv
```

### 2. Instalar dependencias

Desde la raíz del proyecto:

```powershell
uv sync
```

### 3. Correr la API de Simulación (FastAPI)

Para interactuar con la simulación vía API REST y consultar los resultados paginados en formato JSON:

```powershell
uv run python -m uvicorn api:app --reload
```

La API estará disponible en `http://127.0.0.1:8000`. Podés ver la documentación interactiva (Swagger) en `http://127.0.0.1:8000/docs`.

### 4. Endpoints de la API

- **`POST /simulacion`**: Ejecuta una nueva simulación multi-día (reemplaza la anterior) y devuelve las estadísticas y registros del **Día 1**.
  - Query Params: `offset` (default: 0), `limit` (default: 50).
  - Body (opcional): JSON con los parámetros de la simulación (ver tabla más abajo).
- **`GET /simulacion`**: Consulta los registros paginados de un día específico de la simulación activa.
  - Query Params: `dia` (default: 1), `offset` (default: 0), `limit` (default: 50).
- **`GET /estadisticas`**: Devuelve el array de estadísticas independientes de cada jornada simulada (hora de finalización, promedios de espera, porcentajes de bloqueo). Ideal para alimentar gráficos.

> **Nota:** La simulación gestiona el vector de estado en memoria. Podés descargar el archivo `.csv` completo mediante el endpoint `GET /simulacion/exportar`, con todos los días trazados en una única tabla (la columna `Dia` identifica cada jornada).

### 5. Correr por Consola (Script Original)

Si querés correr una simulación aislada desde la consola sin levantar el servidor API:

```powershell
uv run python main.py
```

Esto ejecuta la simulación en memoria y muestra el reporte de cada día y las estadísticas globales en la terminal.

### 6. Correr los tests

```powershell
uv run pytest tests/ -v
```

---

## Parámetros Configurables

Todos los parámetros se pueden configurar en `main.py` (objeto `SimulationConfig`) o en el body del `POST /simulacion`:

| Parámetro               | Descripción                                                                 | Default     |
|-------------------------|-----------------------------------------------------------------------------|-------------|
| `hora_apertura`         | Apertura de la planta (minutos desde medianoche)                            | `480` (8hs) |
| `hora_cierre_puertas`   | Cierre de ingreso (minutos desde medianoche)                                | `960` (16hs)|
| `media_llegada_auto`    | Media del tiempo entre llegadas de autos (min, Exp)                         | `15`        |
| `media_llegada_camioneta` | Media del tiempo entre llegadas de camionetas (min, Exp)                  | `30`        |
| `frenos_min / frenos_max` | Rango de la revisión de Frenos (min, Uniforme)                            | `4 – 7`     |
| `luces_min / luces_max` | Rango de la revisión de Luces y Emisiones (min, Uniforme)                   | `6 – 10`    |
| `num_lineas`            | Cantidad de líneas de inspección                                             | `2`         |
| `master_seed`           | Semilla maestra para reproducibilidad (`None` = aleatorio)                  | `42`        |
| `max_dias`              | Cantidad máxima de días a simular                                           | `10`        |
| `max_iteraciones`       | Umbral de iteraciones totales acumuladas (se corta al superarlo)            | `1000`      |

> **Condición de corte:** La simulación avanza día a día y se detiene cuando se cumple **cualquiera** de las dos condiciones (`max_dias` o `max_iteraciones`). El día en curso siempre se completa antes de cortar.

---

## Reproducibilidad y Seeds

La simulación es completamente determinística dado `master_seed`.  

Para simular múltiples días de forma reproducible, la seed de cada día se deriva automáticamente a partir del número de día:

```python
# Pseudocódigo de la derivación
seed_dia = (master_seed * constante + dia) mod 2^64
```

Esto garantiza que:
- El mismo número de día con la misma `master_seed` siempre produce la misma jornada.
- Días distintos producen secuencias de números aleatorios independientes.
- Cambiar la `master_seed` cambia toda la serie de días de forma reproducible.

---

## Salida Esperada

### Terminal

```
Iniciando simulación (seed maestra=42, max_dias=10, max_iteraciones=1000)...

============================================================
  DÍA 1
  Hora de fin de jornada:           16:00 (960.00 min)
  Tiempo promedio espera autos:      0.0407 min
  Tiempo promedio espera camionetas: 0.2317 min
  Autos atendidos:                  21
  Camionetas atendidas:              15
  Bloqueo Frenos Línea 1:            3.21%
  Bloqueo Frenos Línea 2:            0.09%

============================================================
  DÍA 2
  ...

Total de días simulados: 8
Tiempo de ejecución: 0.43 s

ESTADÍSTICAS GLOBALES:
  Total autos atendidos:       230
  Total camionetas atendidas:  145
  Promedio espera autos:       0.0812 min
  Promedio espera camionetas:  0.3471 min
  Promedio fin de jornada:     16:02
```

### CSV Exportado

El archivo CSV exportado (vía API) contiene todos los días en una única tabla. La primera columna `Dia` identifica la jornada de cada fila. Cada fila corresponde a una transición de estado (procesamiento de un evento):

| Columna | Descripción |
| :--- | :--- |
| `Dia` | Número de la jornada simulada (1, 2, 3, ...) |
| `Evento` | Nombre del evento procesado |
| `Reloj_min` | Instante del reloj de simulación (minutos) |
| **Llegada Auto** | |
| `RND_Llegada_Auto` | Número uniforme $U(0,1)$ usado para el tiempo de arribo de autos |
| `Tiempo_Entre_Llegadas_Auto` | Tiempo entre llegadas generado (exponencial) |
| `Prox_Llegada_Auto` | Minuto programado para la próxima llegada de auto |
| **Llegada Camioneta** | |
| `RND_Llegada_Camioneta` | Número uniforme $U(0,1)$ usado para el tiempo de arribo de camionetas |
| `Tiempo_Entre_Llegadas_Camioneta` | Tiempo entre llegadas generado (exponencial) |
| `Prox_Llegada_Camioneta` | Minuto programado para la próxima llegada de camioneta |
| **Colas** | |
| `Cola_Autos` | Cantidad de autos en cola de entrada |
| `Cola_Camionetas` | Cantidad de camionetas en cola de entrada (prioritarias) |
| **Líneas de Inspección ($i \in \{1, 2\}$)** | |
| `RND_Frenos_L{i}` | Número uniforme $U(0,1)$ usado para el tiempo de Frenos de la línea $i$ |
| `Tiempo_Frenos_L{i}` | Tiempo de revisión en Frenos generado ($U(4,7)$) |
| `Estado_Frenos_L{i}` | Estado de la estación de Frenos de la línea $i$ (`Libre`, `Ocupado`, `Bloqueado`) |
| `Vehiculo_Frenos_L{i}` | ID del vehículo actualmente en la estación de Frenos |
| `Fin_Atencion_Frenos_L{i}` | Minuto de fin de atención programado para la estación de Frenos |
| `RND_Luces_L{i}` | Número uniforme $U(0,1)$ usado para el tiempo de Luces de la línea $i$ |
| `Tiempo_Luces_L{i}` | Tiempo de revisión en Luces generado ($U(6,10)$) |
| `Estado_Luces_L{i}` | Estado de la estación de Luces de la línea $i$ (`Libre`, `Ocupado`) |
| `Vehiculo_Luces_L{i}` | ID del vehículo actualmente en la estación de Luces |
| `Fin_Atencion_Luces_L{i}` | Minuto de fin de atención programado para la estación de Luces |
| **Estadísticas Acumuladas** | |
| `Cant_Autos_Atendidos` | Cantidad total de autos que finalizaron la revisión técnica |
| `Cant_Camionetas_Atendidas` | Cantidad total de camionetas que finalizaron la revisión técnica |
| `Tiempo_Espera_Auto` | Tiempo de espera en cola del auto atendido en el evento actual (si aplica) |
| `Acum_Espera_Autos` | Suma acumulada de los tiempos de espera en cola de autos (minutos) |
| `Tiempo_Espera_Camioneta` | Tiempo de espera en cola de la camioneta atendida en el evento actual (si aplica) |
| `Acum_Espera_Camionetas` | Suma acumulada de los tiempos de espera en cola de camionetas (minutos) |
| `Tiempo_Bloqueo_L{i}` | Tiempo de bloqueo de la estación de Frenos de la línea $i$ liberado en el evento actual |
| `Acum_Bloqueo_Frenos_L{i}` | Tiempo acumulado en que la estación de Frenos de la línea $i$ estuvo bloqueada |
| **Estado del Sistema** | |
| `Clientes_Activos` | Snapshot de vehículos activos. En el CSV se persiste como JSON array string; la API lo devuelve como array de objetos JSON. Cada objeto tiene los campos: `id`, `tipo`, `estado`, `linea`, `hora_llegada`, `hora_inicio_bloqueo`. |

---

## Arquitectura: Patrón DES Orientado a Eventos

La simulación implementa el patrón **Discrete Event Simulation (DES)** orientado a objetos:

1. **`Simulation`** mantiene el reloj, la FEL y el RNG. Ejecuta el bucle exterior (días) y el bucle interior (eventos del día): extraer evento → avanzar reloj → procesar → agendar nuevos eventos.
2. **`Event` (abstracta)** define la interfaz: `timestamp` + `process(sim) → list[Event]`. Cada evento encapsula su propia lógica de transición de estado.
3. **`SimulationState`** es el vector de estado mutable. Los eventos lo consultan y modifican a través de `sim.state`. Se reinicia al comienzo de cada nuevo día.
4. **`EventQueue` (FEL)** es un heap de mínimos. Los eventos se despachan siempre en orden cronológico.
5. **`StatsTracker`** acumula métricas de un único día. Al cierre de cada jornada llama a `cache_final_stats()` para persistir los promedios antes de que el estado se reinicie.
6. **`MemoryExporter`** genera la estructura de datos del CSV directamente en memoria. Indexa los registros por día para que la API pueda acceder a cada jornada en O(1) y genera el archivo completo al vuelo cuando se llama a exportar.
