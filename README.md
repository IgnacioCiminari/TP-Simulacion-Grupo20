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
├── pyproject.toml             # Configuración del proyecto (uv)
│
├── core/                      # Motor de simulación (DES)
│   ├── event.py               # Clase abstracta Event
│   ├── fel.py                 # Future Event List (heap de prioridad)
│   ├── rng.py                 # Generador de números pseudoaleatorios con traza de RND
│   ├── simulation.py          # Clase Simulation: bucle principal, RNG, config
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
│   └── exporter.py            # CsvExporter: genera el vector de estado en CSV
│
├── tests/                     # Suite de tests (pytest)
│   ├── test_queue.py          # Tests unitarios de la cola con prioridad
│   └── test_events.py         # Tests de bloqueo, desbloqueo y simulación completa
│
└── output/                    # Generado automáticamente al correr la simulación
    └── vector_de_estado.csv   # Traza completa del vector de estado
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

### 3. Correr la simulación

```powershell
uv run main.py
```

Esto genera el archivo `output/vector_de_estado.csv` y muestra el reporte en la terminal.

### 4. Correr los tests

```powershell
uv run pytest tests/ -v
```

---

## Parámetros Configurables

Todos los parámetros están en `main.py` dentro del objeto `SimulationConfig`:

| Parámetro               | Descripción                                              | Default     |
|-------------------------|----------------------------------------------------------|-------------|
| `hora_apertura`         | Apertura de la planta (minutos desde medianoche)         | `480` (8hs) |
| `hora_cierre_puertas`   | Cierre de ingreso (minutos desde medianoche)             | `960` (16hs)|
| `media_llegada_auto`    | Media del tiempo entre llegadas de autos (min, Exp)     | `15`        |
| `media_llegada_camioneta` | Media del tiempo entre llegadas de camionetas (min, Exp) | `30`      |
| `frenos_min / frenos_max` | Rango de la revisión de Frenos (min, Uniforme)         | `4 – 7`     |
| `luces_min / luces_max` | Rango de la revisión de Luces y Emisiones (min, Uniforme)| `6 – 10`   |
| `num_lineas`            | Cantidad de líneas de inspección                         | `2`         |
| `csv_output_path`       | Ruta de salida del CSV                                   | `output/vector_de_estado.csv` |
| `master_seed`           | Semilla maestra para reproducibilidad (`None` = aleatorio) | `42`      |
| `run_index`             | Índice del día simulado (para seeds derivadas por día)   | `1`         |

---

## Reproducibilidad y Seeds

La simulación es completamente determinística dado un par `(master_seed, run_index)`.  

Para simular múltiples días de forma reproducible, la seed de cada día se deriva automáticamente:

```python
# Pseudocódigo de la derivación
seed_dia = (master_seed * constante + run_index) mod 2^64
```

Esto garantiza que:
- El mismo `run_index` con la misma `master_seed` siempre produce la misma jornada.
- Días distintos producen secuencias de números aleatorios independientes.
- Cambiar la `master_seed` cambia toda la serie de días de forma reproducible.

---

## Salida Esperada

### Terminal

```
Iniciando simulación (seed maestra=42, día=1)...
============================================================
  RESULTADOS DE LA SIMULACIÓN - RTV
============================================================
  Hora de fin de jornada:           16:47 (1007.58 min)
  Tiempo promedio espera autos:      0.0388 min
  Tiempo promedio espera camionetas: 0.2172 min
  Autos atendidos:                  22
  Camionetas atendidas:              16
  Bloqueo Frenos Línea 1:            2.92%
  Bloqueo Frenos Línea 2:            0.08%
============================================================

Vector de estado guardado en: output/vector_de_estado.csv
```

### CSV (`output/vector_de_estado.csv`)

El CSV tiene **columnas fijas** con el estado completo del sistema en cada transición, incluyendo las columnas de variables aleatorias (`RND_*` y `Tiempo_*`) asociadas al evento en la misma fila (se muestran vacías en los eventos donde no se muestrearon):

| Columna | Descripción |
| :--- | :--- |
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
| `Acum_Espera_Autos` | Suma acumulada de los tiempos de espera en cola de autos (minutos) |
| `Acum_Espera_Camionetas` | Suma acumulada de los tiempos de espera en cola de camionetas (minutos) |
| `Acum_Bloqueo_Frenos_L{i}` | Tiempo acumulado en que la estación de Frenos de la línea $i$ estuvo bloqueada |
| **Estado del Sistema** | |
| `Clientes_Activos` | Snapshot serializado de vehículos activos: `[ID:X, Tipo, Estado, L:N]; ...` (Opción A) |

---

## Arquitectura: Patrón DES Orientado a Eventos

La simulación implementa el patrón **Discrete Event Simulation (DES)** orientado a objetos:

1. **`Simulation`** mantiene el reloj, la FEL y el RNG. Ejecuta el bucle: extraer evento → avanzar reloj → procesar → agendar nuevos eventos.
2. **`Event` (abstracta)** define la interfaz: `timestamp` + `process(sim) → list[Event]`. Cada evento encapsula su propia lógica de transición de estado.
3. **`SimulationState`** es el vector de estado mutable. Los eventos lo consultan y modifican a través de `sim.state`.
4. **`EventQueue` (FEL)** es un heap de mínimos. Los eventos se despachan siempre en orden cronológico.
