# 🏗️ Arquitectura Completa — TP Simulación Grupo 20

> **Propósito de este documento:** Servir como referencia exhaustiva de toda la arquitectura, stack tecnológico, patrones de diseño, estructura de carpetas y decisiones técnicas del proyecto. Está pensado para que cualquier agente o desarrollador pueda reproducir las mismas estructuras y formas de trabajo en un proyecto nuevo (por ejemplo, Simulación de Montecarlo o Simulación Discreta por Eventos).

---

## 📑 Tabla de Contenidos

1. [Visión General del Proyecto](#1-visión-general-del-proyecto)
2. [Stack Tecnológico Completo](#2-stack-tecnológico-completo)
3. [Estructura de Carpetas del Monorepo](#3-estructura-de-carpetas-del-monorepo)
4. [Backend — Python + FastAPI + Uvicorn](#4-backend--python--fastapi--uvicorn)
   - 4.1 [Gestor de dependencias: `uv`](#41-gestor-de-dependencias-uv)
   - 4.2 [Configuración del proyecto: `pyproject.toml`](#42-configuración-del-proyecto-pyprojecttoml)
   - 4.3 [Servidor ASGI: Uvicorn](#43-servidor-asgi-uvicorn)
   - 4.4 [API REST con FastAPI: `api.py`](#44-api-rest-con-fastapi-apipy)
   - 4.5 [Motor de Simulación DES](#45-motor-de-simulación-des)
   - 4.6 [Modularización del Backend](#46-modularización-del-backend)
   - 4.7 [Patrones de Diseño del Backend](#47-patrones-de-diseño-del-backend)
   - 4.8 [Testing con Pytest](#48-testing-con-pytest)
5. [Frontend — React + Vite + Tailwind CSS](#5-frontend--react--vite--tailwind-css)
   - 5.1 [Scaffolding: Vite + React](#51-scaffolding-vite--react)
   - 5.2 [Package Manager: pnpm](#52-package-manager-pnpm)
   - 5.3 [Dependencias del Frontend](#53-dependencias-del-frontend)
   - 5.4 [Estilo: Tailwind CSS + Shadcn/ui manual](#54-estilo-tailwind-css--shadcnui-manual)
   - 5.5 [Estructura de Carpetas del Frontend](#55-estructura-de-carpetas-del-frontend)
   - 5.6 [Routing y Navegación](#56-routing-y-navegación)
   - 5.7 [Layout y Navbar](#57-layout-y-navbar)
   - 5.8 [Context API (Estado Global)](#58-context-api-estado-global)
   - 5.9 [Capa de Servicios HTTP](#59-capa-de-servicios-http)
   - 5.10 [Páginas del Frontend](#510-páginas-del-frontend)
   - 5.11 [Dark Mode](#511-dark-mode)
   - 5.12 [Notificaciones Toast](#512-notificaciones-toast)
6. [Docker y Docker Compose](#6-docker-y-docker-compose)
   - 6.1 [Dockerfile del Backend](#61-dockerfile-del-backend)
   - 6.2 [Dockerfile del Frontend](#62-dockerfile-del-frontend)
   - 6.3 [docker-compose.yml](#63-docker-composeyml)
7. [Flujo Completo de la Aplicación](#7-flujo-completo-de-la-aplicación)
8. [Convenciones y Patrones Clave para Reproducir](#8-convenciones-y-patrones-clave-para-reproducir)
9. [Checklist para Crear un Nuevo Proyecto Similar](#9-checklist-para-crear-un-nuevo-proyecto-similar)

---

## 1. Visión General del Proyecto

Sistema de **simulación de eventos discretos (DES)** para una planta de Revisión Técnica Vehicular. Arquitectura **cliente-servidor desacoplada**:

| Capa | Tecnología | Puerto | Responsabilidad |
|------|------------|--------|-----------------|
| **Backend** | Python 3.11 + FastAPI + Uvicorn | `8000` | Motor de simulación + API REST |
| **Frontend** | React 18 + Vite 5 + Tailwind CSS 3 | `5173` (dev) / `80` (prod) | Interfaz web interactiva |
| **Orquestación** | Docker Compose | — | Levanta ambos servicios con un solo comando |

La comunicación es **100% vía API REST** (JSON sobre HTTP). El frontend hace polling al backend para seguir el progreso de la simulación.

---

## 2. Stack Tecnológico Completo

### Backend
| Tecnología | Versión | Rol |
|------------|---------|-----|
| **Python** | 3.11+ | Lenguaje del motor de simulación |
| **FastAPI** | ≥0.115 | Framework HTTP (API REST) |
| **Uvicorn** | ≥0.30 | Servidor ASGI (producción y desarrollo) |
| **uv** | latest | Gestor de dependencias ultrarrápido (reemplazo de pip/poetry) |
| **Pydantic** | v2 (integrado en FastAPI) | Validación de schemas de entrada |
| **pytest** | ≥9.0 | Testing |

### Frontend
| Tecnología | Versión | Rol |
|------------|---------|-----|
| **React** | 18.2.0 | UI library |
| **Vite** | 5.0.8 | Bundler y dev server |
| **React Router DOM** | 6.20.1 | Client-side routing (SPA) |
| **Tailwind CSS** | 3.4.x | Utility-first CSS framework |
| **Axios** | 1.6.2 | Cliente HTTP |
| **Recharts** | 3.8.x | Gráficos (BarChart, ScatterChart, etc.) |
| **@tanstack/react-table** | 8.21.x | Tabla virtualizada con paginación |
| **react-hook-form** | 7.76.x | Manejo de formularios con validación |
| **Sonner** | 2.0.x | Notificaciones toast |
| **Lucide React** | 1.16.x | Iconos SVG |
| **clsx + tailwind-merge** | — | Utilidad `cn()` para clases condicionales (patrón shadcn/ui) |
| **class-variance-authority** | 0.7.x | Variantes de componentes estilo shadcn |
| **pnpm** | 9.x | Package manager |

### Infraestructura
| Tecnología | Rol |
|------------|-----|
| **Docker** | Contenedorización |
| **Docker Compose** | Orquestación multi-servicio |
| **Nginx** | Servidor web estático (producción del frontend) |

---

## 3. Estructura de Carpetas del Monorepo

```
TP-Simulacion-Grupo20/               ← Raíz del monorepo
│
├── docker-compose.yml                ← Orquestación de los 2 servicios
├── .gitignore                        ← Ignora Api/output/
├── README.md                         ← Documentación general del proyecto
├── Arquitectura.md                   ← ★ ESTE ARCHIVO
│
├── Api/                              ← 🐍 BACKEND (Python + FastAPI)
│   ├── Dockerfile                    ← Multi-stage build (uv builder → python:3.11-alpine)
│   ├── pyproject.toml                ← Dependencias (uv)
│   ├── uv.lock                       ← Lockfile determinístico
│   ├── .python-version               ← "3.11"
│   ├── api.py                        ← 🎯 Definición de endpoints FastAPI
│   ├── main.py                       ← Punto de entrada CLI (uv run main.py)
│   ├── update_docx.py                ← Script utilitario
│   │
│   ├── core/                         ← Motor DES (reloj, FEL, RNG, estado)
│   │   ├── __init__.py
│   │   ├── simulation.py             ← 🧠 Clase Simulation + SimulationConfig
│   │   ├── state.py                  ← SimulationState (vector de estado)
│   │   ├── event.py                  ← Clase abstracta Event (base de todos los eventos)
│   │   ├── fel.py                    ← EventQueue (FEL con heapq)
│   │   └── rng.py                    ← TrackedRandom (RNG con trazabilidad)
│   │
│   ├── entities/                     ← Entidades del dominio
│   │   ├── __init__.py
│   │   ├── vehicle.py                ← Vehicle, VehicleType, VehicleState
│   │   ├── station.py                ← Station, StationType, StationStatus
│   │   ├── line.py                   ← InspectionLine (Frenos → Luces)
│   │   └── queue.py                  ← PriorityVehicleQueue (doble cola FIFO)
│   │
│   ├── events/                       ← Implementaciones concretas de eventos
│   │   ├── __init__.py
│   │   ├── _routing.py               ← Lógica compartida de ruteo a Frenos
│   │   ├── llegada_auto.py           ← LlegadaAuto
│   │   ├── llegada_camioneta.py      ← LlegadaCamioneta
│   │   ├── cierre_puertas.py         ← CierrePuertas
│   │   ├── fin_frenos.py             ← FinRevisionFrenos + _dequeue_to_frenos
│   │   └── fin_luces.py              ← FinRevisionLuces (desbloqueo de Frenos)
│   │
│   ├── stats/                        ← Estadísticas y exportación
│   │   ├── __init__.py
│   │   ├── tracker.py                ← StatsTracker (por día) + GlobalStatsAccumulator
│   │   └── exporter.py               ← MemoryExporter (vector de estado en RAM, CSV on-demand)
│   │
│   ├── tests/                        ← Suite de pruebas
│   │   ├── __init__.py
│   │   ├── test_events.py            ← Tests de eventos DES
│   │   └── test_queue.py             ← Tests de la cola con prioridad
│   │
│   ├── output/                       ← Carpeta para CSV exportados (volumen Docker)
│   ├── README.md                     ← Documentación técnica del backend
│   └── DOCUMENTACION_API.md          ← Referencia completa de endpoints REST
│
└── Frontend/                         ← ⚛️ FRONTEND (React + Vite + Tailwind)
    ├── Dockerfile                    ← Multi-stage (node:20-alpine → nginx:alpine)
    ├── .dockerignore                 ← Excluye node_modules, dist, etc.
    ├── package.json                  ← Dependencias
    ├── pnpm-lock.yaml                ← Lockfile de pnpm
    ├── pnpm-workspace.yaml           ← Configuración de workspace pnpm
    ├── vite.config.js                ← Configuración de Vite
    ├── tailwind.config.js            ← Configuración de Tailwind CSS
    ├── postcss.config.js             ← PostCSS (tailwindcss + autoprefixer)
    ├── index.html                    ← HTML entry point (SPA)
    │
    └── src/
        ├── main.jsx                  ← Punto de entrada React (StrictMode + Toaster)
        ├── App.jsx                   ← 🎯 Routing principal (BrowserRouter + Routes)
        ├── index.css                 ← Tailwind directives + estilos globales
        │
        ├── lib/
        │   └── utils.js              ← Función cn() (clsx + tailwind-merge)
        │
        ├── components/
        │   ├── Layout.jsx            ← Layout shell (Navbar + main content)
        │   ├── Navbar.jsx            ← ⭐ Barra de navegación con NavLink + dark mode toggle
        │   └── ui/
        │       └── Progress.jsx      ← Componente estilo shadcn/ui (barra de progreso)
        │
        ├── context/
        │   ├── SimulationContext.jsx  ← Estado global de simulación (resultados, stats)
        │   └── ThemeContext.jsx       ← Estado global del tema (dark/light con localStorage)
        │
        ├── services/
        │   ├── api.js                ← Instancia Axios centralizada (baseURL)
        │   └── simulation.service.js ← Funciones wrapper para cada endpoint
        │
        └── pages/
            ├── Config.jsx            ← ⚙️ Formulario de parámetros + barra de progreso
            ├── Statistics.jsx        ← 📊 Tarjetas de estadísticas globales
            ├── Table.jsx             ← 📋 Vector de estado paginado con @tanstack/react-table
            └── Graph.jsx             ← 📈 Gráficos interactivos con Recharts
```

---

## 4. Backend — Python + FastAPI + Uvicorn

### 4.1 Gestor de dependencias: `uv`

Se usa **[uv](https://docs.astral.sh/uv/)** (de Astral, los creadores de Ruff) en lugar de pip, poetry o conda. Es un gestor de dependencias y entornos virtuales ultrarrápido escrito en Rust.

**Comandos clave:**

```bash
# Instalar dependencias (equivalente a pip install + venv)
uv sync

# Ejecutar un script con las dependencias del proyecto
uv run main.py

# Ejecutar uvicorn para levantar la API
uv run uvicorn api:app --reload

# Agregar una nueva dependencia
uv add nombre-paquete

# Correr tests
uv run pytest
```

**Archivos generados por uv:**
- `pyproject.toml` — define el proyecto y sus dependencias
- `uv.lock` — lockfile determinístico (como `pnpm-lock.yaml` pero para Python)
- `.python-version` — pin de la versión de Python (ej: `3.11`)
- `.venv/` — entorno virtual local (gitignoreado)

### 4.2 Configuración del proyecto: `pyproject.toml`

```toml
[project]
name = "tp-simulacion-grupo20"
version = "0.1.0"
description = "Add your description here"
requires-python = ">=3.11"
dependencies = [
    "pytest>=9.0.3",
    "fastapi>=0.115.0",
    "uvicorn>=0.30.0",
]
```

**Punto importante:** Las dependencias son mínimas y directas. No se usan ORMs ni bases de datos — todo vive en memoria RAM durante la ejecución de la simulación.

### 4.3 Servidor ASGI: Uvicorn

**Uvicorn** es el servidor ASGI que ejecuta la aplicación FastAPI.

**En desarrollo:**
```bash
uv run uvicorn api:app --reload
# --reload habilita hot-reload al modificar archivos Python
```

**En producción (Docker):**
```dockerfile
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
# Sin --reload, sin --workers adicionales (la simulación usa threading internamente)
```

**La cadena `api:app` significa:**
- `api` → archivo `api.py`
- `app` → variable `app = FastAPI(...)` dentro de ese archivo

### 4.4 API REST con FastAPI: `api.py`

Este es el archivo central que define todos los endpoints HTTP. Características principales:

#### Creación de la app FastAPI

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="RTV Simulation API",
    description="API para ejecutar y consultar simulaciones...",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",        # Frontend en Docker (Nginx, puerto 80)
        "http://localhost:5173",   # Frontend en desarrollo local (Vite)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### Patrón de estado en memoria

No usa base de datos. La simulación activa se guarda en una variable global con un lock para concurrencia:

```python
_simulacion_activa: dict | None = None
_progreso: dict = {
    "status": "idle",           # idle | running | done | error
    "dias_completados": 0,
    "max_dias": 0,
    "iteraciones_completadas": 0,
    "max_iteraciones": 0,
    "error_detail": None,
}
_lock = threading.Lock()
```

#### Esquema de entrada con Pydantic

```python
from pydantic import BaseModel

class SimulationConfigIn(BaseModel):
    hora_apertura: float = 480.0
    hora_cierre_puertas: float = 960.0
    media_llegada_auto: float = 15.0
    # ... valores por defecto para todos los parámetros
```

#### Simulación en background con threading

La simulación se ejecuta en un thread separado para no bloquear el servidor:

```python
@app.post("/simulacion")
def run_simulacion(config_in: SimulationConfigIn | None = None):
    # Iniciar thread de simulación
    thread = threading.Thread(target=_run_background, daemon=True)
    thread.start()
    return {"status": "started"}
```

El frontend hace **polling** al endpoint `/simulacion/progreso` cada 1.5 segundos para saber cuándo terminó.

#### Tabla de endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/simulacion` | Lanza simulación en background |
| `GET` | `/simulacion/progreso` | Estado de avance (polling) |
| `GET` | `/simulacion?dia=N&offset=0&limit=50` | Registros paginados de un día |
| `GET` | `/simulacion/ultimo_registro` | Último evento registrado |
| `POST` | `/simulacion/exportar` | Guarda CSV en `output/` |
| `GET` | `/estadisticas` | Stats de cada día simulado |
| `GET` | `/estadisticas/top_bloqueo?n=10` | Top N días con mayor bloqueo |
| `GET` | `/estadisticas_globales` | Stats globales agregadas |

### 4.5 Motor de Simulación DES

#### Arquitectura del motor

El motor sigue el paradigma clásico de **Simulación Discreta por Eventos (DES)**:

1. **Reloj de simulación** → `state.clock` (avanza al timestamp del próximo evento)
2. **FEL (Future Event List)** → `EventQueue` basada en `heapq` (min-heap por timestamp)
3. **Vector de estado** → `SimulationState` (contiene todo el estado mutable del sistema)
4. **Eventos** → Clases que heredan de `Event` (patrón Strategy)
5. **RNG trazable** → `TrackedRandom` (captura el U(0,1) base para el CSV)

#### Bucle principal (`simulation.py`)

```python
# Bucle del día
while self.fel:                              # mientras haya eventos en la FEL
    event = self.fel.pop()                   # extraer el próximo evento
    self.state.clock = event.timestamp       # avanzar el reloj
    self.reset_row_context()                 # limpiar RNDs del evento anterior
    new_events = event.process(self)         # procesar → transición de estado
    for new_event in new_events:
        self.schedule(new_event)             # agendar eventos generados
    self.exporter.write_row(...)             # registrar fila en el vector de estado
```

#### Soporte multi-día

La simulación soporta ejecutar **N días** consecutivos. Cada día:
- Tiene una seed derivada determinísticamente: `seed = (master_seed * 6364136223846793005 + dia) & 0xFFFFFFFFFFFFFFFF`
- Se inicializa con estado fresco (reloj, colas, estaciones)
- Los offsets globales (autos atendidos, esperas) se acumulan entre días

#### Condiciones de corte

La simulación se detiene cuando se cumple **CUALQUIERA** de estas condiciones:
- `max_dias` días completados
- `max_iteraciones` filas totales acumuladas

#### Callback de progreso

```python
def run(self, on_day_complete=None):
    # ...
    if on_day_complete is not None:
        on_day_complete(dia, total_iteraciones)
```

El endpoint `POST /simulacion` pasa un callback que actualiza `_progreso` con lock.

#### `SimulationConfig` (`core/simulation.py`)

```python
@dataclass
class SimulationConfig:
    hora_apertura: float = 480.0        # 08:00 hs (en minutos)
    hora_cierre_puertas: float = 960.0  # 16:00 hs
    media_llegada_auto: float = 15.0    # exponencial
    media_llegada_camioneta: float = 30.0
    frenos_min: float = 4.0             # uniforme
    frenos_max: float = 7.0
    luces_min: float = 6.0
    luces_max: float = 10.0
    num_lineas: int = 2
    master_seed: int = 42
    max_dias: int = 10
    max_iteraciones: int = 1_000
```

### 4.6 Modularización del Backend

El backend sigue una estructura modular clara con **separación por responsabilidad**:

#### `core/` — Motor de simulación (framework)
| Archivo | Clase/Función | Responsabilidad |
|---------|---------------|-----------------|
| `event.py` | `Event` (ABC) | Clase abstracta base para eventos. Define `process()` y `nombre` |
| `fel.py` | `EventQueue` | FEL con heap de mínimos. Soporta `push`, `pop`, `peek`, `remove_by_type` |
| `rng.py` | `TrackedRandom` | Wrapper sobre `random.Random`. Devuelve `(rnd, value)` para trazabilidad |
| `state.py` | `SimulationState` | Vector de estado global: reloj, colas, líneas, contadores, caché de vehículos |
| `simulation.py` | `Simulation`, `SimulationConfig`, `DayResult` | Motor principal, configuración y resultado por día |

#### `entities/` — Modelo de dominio
| Archivo | Clase | Responsabilidad |
|---------|-------|-----------------|
| `vehicle.py` | `Vehicle`, `VehicleType`, `VehicleState` | Vehículo con enums para tipo y estado |
| `station.py` | `Station`, `StationType`, `StationStatus` | Estación de servicio con transiciones de estado |
| `line.py` | `InspectionLine` | Línea de inspección (Frenos → Luces, secuencial) |
| `queue.py` | `PriorityVehicleQueue` | Cola con prioridad: camionetas antes que autos (doble `deque`) |

#### `events/` — Implementaciones de eventos
| Archivo | Clase | Qué hace |
|---------|-------|----------|
| `llegada_auto.py` | `LlegadaAuto` | Crea vehículo Auto, lo rutea a Frenos o cola, agenda próxima llegada |
| `llegada_camioneta.py` | `LlegadaCamioneta` | Ídem pero con prioridad en cola |
| `cierre_puertas.py` | `CierrePuertas` | Marca `puertas_abiertas=False`, elimina llegadas futuras de la FEL |
| `fin_frenos.py` | `FinRevisionFrenos` | Transfiere a Luces o bloquea Frenos. Incluye `_dequeue_to_frenos()` |
| `fin_luces.py` | `FinRevisionLuces` | Retira vehículo, desbloquea Frenos si estaba bloqueado |
| `_routing.py` | `_route_vehicle_to_frenos()` | Lógica compartida por ambas llegadas |

#### `stats/` — Estadísticas y exportación
| Archivo | Clase | Responsabilidad |
|---------|-------|-----------------|
| `tracker.py` | `StatsTracker` | Métricas de un día: bloqueos, esperas, atendidos, max cola |
| `tracker.py` | `GlobalStatsAccumulator` | Acumula stats de todos los días (promedios globales) |
| `exporter.py` | `MemoryExporter` | Mantiene el vector de estado en RAM como `dict[int, list[tuple]]`. Genera CSV on-demand |

### 4.7 Patrones de Diseño del Backend

1. **Strategy Pattern** — Cada tipo de evento es una subclase de `Event` con su propio `process()`.

2. **Row Context** — El método `reset_row_context()` limpia un diccionario temporal antes de cada evento. Los métodos `sample_*()` escriben el RND y el valor generado en este contexto. El exporter lo lee para construir la fila del vector de estado.

3. **Caché diferencial de vehículos** — En lugar de recorrer todas las colas y estaciones para saber qué vehículos hay activos, se mantiene un diccionario `_active_vehicles_cache` que se actualiza incrementalmente con `track_vehicle_enter/update/exit`.

4. **Optimización de formateo** — Los formatters de float (`_FORMATTERS`) están precalculados para evitar re-parsing del format spec en el loop caliente.

5. **Precálculo de claves de contexto** — Las claves como `rnd_frenos_l1`, `tiempo_luces_l2` se precalculan en `__init__` y se reusan en cada `reset_row_context()`.

6. **Exportación diferida** — El `MemoryExporter` almacena tuplas crudas en RAM. El formateo a dict (`format_row()`) solo ocurre cuando el frontend pide los datos. El CSV se genera on-demand.

7. **Seed derivada determinística** — Cada día usa una seed derivada de la master seed usando un multiplicador LCG. Esto garantiza reproducibilidad sin que los días interfieran entre sí.

### 4.8 Testing con Pytest

```bash
uv run pytest           # Ejecutar todos los tests
uv run pytest -v        # Con detalle
```

Los tests están en `Api/tests/` y cubren:
- `test_events.py` — Tests de la lógica de eventos DES
- `test_queue.py` — Tests de la cola con prioridad (orden camionetas > autos)

---

## 5. Frontend — React + Vite + Tailwind CSS

### 5.1 Scaffolding: Vite + React

El frontend fue creado con **Vite** (bundler moderno ultrarrápido) usando el plugin de React:

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

**Comandos de desarrollo:**
```bash
pnpm dev      # Dev server en http://localhost:5173 con HMR
pnpm build    # Build de producción en dist/
pnpm preview  # Preview del build de producción
```

### 5.2 Package Manager: pnpm

Se usa **pnpm** en lugar de npm/yarn. Es más rápido y eficiente con el disco.

```yaml
# pnpm-workspace.yaml
packages:
  - "."
```

### 5.3 Dependencias del Frontend

```json
{
  "dependencies": {
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-router-dom": "6.20.1",          // Routing SPA
    "axios": "1.6.2",                      // Cliente HTTP
    "@tanstack/react-table": "^8.21.3",    // Tabla virtualizada
    "react-hook-form": "^7.76.1",          // Formularios con validación
    "recharts": "^3.8.1",                  // Gráficos
    "sonner": "^2.0.7",                    // Toast notifications
    "lucide-react": "^1.16.0",            // Iconos
    "tailwindcss": "^3.4.19",             // CSS framework
    "autoprefixer": "^10.5.0",
    "postcss": "^8.5.15",
    "clsx": "^2.1.1",                     // Clases condicionales
    "tailwind-merge": "^3.6.0",           // Merge inteligente de clases TW
    "class-variance-authority": "^0.7.1"  // Variantes de componentes
  },
  "devDependencies": {
    "@vitejs/plugin-react": "4.2.1",
    "vite": "5.0.8"
  }
}
```

### 5.4 Estilo: Tailwind CSS + Shadcn/ui manual

#### Configuración de Tailwind

```javascript
// tailwind.config.js
export default {
  darkMode: "class",                    // ← Dark mode por clase CSS (toggle manual)
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

```javascript
// postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

#### CSS Global (`index.css`)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * { box-sizing: border-box; }
  html {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  body { margin: 0; padding: 0; }

  /* Scrollbar personalizado */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 3px; }
  .dark ::-webkit-scrollbar-thumb { background: #3f3f46; }
}
```

#### Patrón shadcn/ui — Utilidad `cn()`

Se usa el patrón de **shadcn/ui** para construir componentes: la función `cn()` combina `clsx` (para clases condicionales) con `tailwind-merge` (para resolver conflictos de utilidades Tailwind):

```javascript
// src/lib/utils.js
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
```

#### Componente UI estilo shadcn (`Progress.jsx`)

Los componentes UI se construyen "a mano" siguiendo el estilo de shadcn/ui (sin instalar shadcn como CLI), usando `cn()` para composición de clases:

```jsx
import { cn } from "../../lib/utils";

export function Progress({ value = 0, className, indicatorClassName, ...props }) {
    const pct = Math.min(100, Math.max(0, value ?? 0));
    return (
        <div
            role="progressbar"
            aria-valuenow={pct}
            className={cn(
                "relative h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800",
                className,
            )}
            {...props}
        >
            <div
                className={cn(
                    "h-full rounded-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-500 ease-out",
                    indicatorClassName,
                )}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}
```

**Patrón clave:** Los componentes aceptan `className` externo y lo fusionan con `cn()`. También aceptan props de variante como `indicatorClassName`.

#### Paleta de colores

Se usa la escala de **zinc** de Tailwind como paleta monocromática base, con acentos puntuales:

| Uso | Light | Dark |
|-----|-------|------|
| Fondo principal | `bg-zinc-50` | `dark:bg-zinc-950` |
| Fondo de tarjetas | `bg-white` | `dark:bg-zinc-900` |
| Texto principal | `text-zinc-900` | `dark:text-zinc-50` |
| Texto secundario | `text-zinc-500` | `dark:text-zinc-400` |
| Bordes | `border-zinc-200` | `dark:border-zinc-800` |
| Botón primario | `bg-zinc-900 text-white` | `dark:bg-zinc-100 dark:text-zinc-900` |
| Acento éxito | `text-emerald-500` | — |
| Acento error | `text-red-500` | — |

### 5.5 Estructura de Carpetas del Frontend

```
src/
├── main.jsx              ← Entry point: StrictMode + Toaster global
├── App.jsx               ← Router + Providers (Theme, Simulation)
├── index.css             ← Tailwind directives + estilos globales
│
├── lib/utils.js          ← cn() helper
│
├── components/           ← Componentes reutilizables
│   ├── Layout.jsx        ← Shell: Navbar + <main>
│   ├── Navbar.jsx        ← Navegación con NavLink
│   └── ui/               ← Primitivas UI estilo shadcn
│       └── Progress.jsx
│
├── context/              ← React Context para estado global
│   ├── SimulationContext.jsx
│   └── ThemeContext.jsx
│
├── services/             ← Capa HTTP
│   ├── api.js            ← Axios instance
│   └── simulation.service.js  ← Funciones por endpoint
│
└── pages/                ← Una página por ruta
    ├── Config.jsx        ← /config
    ├── Statistics.jsx    ← /stats
    ├── Table.jsx         ← /table
    └── Graph.jsx         ← /graph
```

### 5.6 Routing y Navegación

Se usa **React Router DOM v6** con `BrowserRouter` y `Routes`:

```jsx
// App.jsx
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";

function App() {
  return (
    <ThemeProvider>
      <SimulationProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate replace to="/config" />} />
              <Route path="/config" element={<Config />} />
              <Route path="/stats" element={<Statistics />} />
              <Route path="/table" element={<Table />} />
              <Route path="/graph" element={<Graph />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </SimulationProvider>
    </ThemeProvider>
  );
}
```

**Puntos importantes:**
- `/` redirige automáticamente a `/config`
- Los providers (`ThemeProvider`, `SimulationProvider`) envuelven TODO incluido el router
- El `Layout` (que contiene el `Navbar`) envuelve las `Routes`

### 5.7 Layout y Navbar

#### Layout (`Layout.jsx`)

```jsx
import Navbar from "./Navbar";

export default function Layout({ children }) {
    return (
        <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
            <Navbar />
            <main className="mx-auto max-w-screen-xl px-6 py-8">
                {children}
            </main>
        </div>
    );
}
```

El Layout define la estructura visual base: fondo que cubre toda la pantalla, navbar pegado arriba, y el contenido centrado con `max-w-screen-xl`.

#### Navbar (`Navbar.jsx`)

```jsx
import { NavLink } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { Sun, Moon, Activity } from "lucide-react";

const navItems = [
    { to: "/config", label: "Configuración" },
    { to: "/stats", label: "Estadísticas" },
    { to: "/table", label: "Tabla" },
    { to: "/graph", label: "Gráficos" },
];
```

**Características del Navbar:**
1. **Sticky** — `sticky top-0 z-50` para que quede fijo al hacer scroll
2. **Glassmorphism** — `bg-white/80 backdrop-blur-sm` (fondo semi-transparente con blur)
3. **NavLink con estado activo** — Usa la prop `isActive` de React Router para cambiar el estilo del link activo:
   ```jsx
   <NavLink
       className={({ isActive }) =>
           isActive
               ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
               : "text-zinc-600 hover:bg-zinc-100 ..."
       }
   >
   ```
4. **Logo con ícono** — `Activity` de Lucide + texto "Simulación RTV"
5. **Toggle de tema** — Botón que alterna entre `Sun` y `Moon` según el tema actual
6. **Responsive** — `flex items-center justify-between` distribuye logo, links y toggle

### 5.8 Context API (Estado Global)

Se usan **dos contextos** de React para estado global:

#### SimulationContext

Guarda los resultados de la última simulación para compartirlos entre páginas:

```jsx
export function SimulationProvider({ children }) {
    const [simulationResult, setSimulationResult] = useState(null);  // datos del día 1
    const [globalStats, setGlobalStats] = useState(null);             // stats globales
    const [totalDias, setTotalDias] = useState(null);                 // total de días
    const [lastRow, setLastRow] = useState(null);                     // último registro

    return (
        <SimulationContext.Provider value={{
            simulationResult, setSimulationResult,
            globalStats, setGlobalStats,
            totalDias, setTotalDias,
            lastRow, setLastRow,
        }}>
            {children}
        </SimulationContext.Provider>
    );
}

// Hook para consumir
export function useSimulation() {
    const ctx = useContext(SimulationContext);
    if (!ctx) throw new Error("useSimulation debe usarse dentro de SimulationProvider");
    return ctx;
}
```

#### ThemeContext

Gestiona el tema dark/light con persistencia en `localStorage`:

```jsx
export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem("rtv-theme") || "dark";  // default: dark
    });

    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(theme);                   // agrega clase al <html>
        localStorage.setItem("rtv-theme", theme);
    }, [theme]);

    const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
```

**Mecanismo:** Tailwind CSS está configurado con `darkMode: "class"`, así que agregar/quitar la clase `dark` en el `<html>` activa todas las variantes `dark:*`.

### 5.9 Capa de Servicios HTTP

#### Instancia Axios centralizada (`services/api.js`)

```javascript
import axios from "axios";

export const api = axios.create({
    baseURL: "http://127.0.0.1:8000",
    headers: {
        "Content-Type": "application/json",
    },
});
```

#### Service Layer (`services/simulation.service.js`)

Cada endpoint de la API tiene una función wrapper:

```javascript
import { api } from "./api";

const runSimulation = async (config = {}) => {
    const response = await api.post("/simulacion", config);
    return response.data;
};

const getProgreso = async () => {
    const response = await api.get("/simulacion/progreso");
    return response.data;
};

const getDayRecords = async (dia = 1, offset = 0, limit = 50) => {
    const response = await api.get("/simulacion", {
        params: { dia, offset, limit },
    });
    return response.data;
};

// ... getAllStats, getGlobalStats, getTopBloqueo, downloadCsv, healthCheck

export default {
    runSimulation, getProgreso, getDayRecords,
    getUltimoRegistro, getAllStats, getGlobalStats,
    getTopBloqueo, downloadCsv, healthCheck,
};
```

**Patrón:** Un solo `export default` con todas las funciones como objeto. Se importa como `simulationService.runSimulation()`.

### 5.10 Páginas del Frontend

#### Config (`/config`)

**Responsabilidad:** Formulario de parámetros de simulación + panel de progreso en tiempo real.

**Tecnologías usadas:**
- `react-hook-form` con `Controller` para inputs controlados
- `sonner` para toasts de éxito/error
- `lucide-react` para íconos (Loader2, Play, CalendarDays, Zap, CheckCircle2)
- Componente `Progress` personalizado (estilo shadcn)

**Flujo del formulario:**
1. El usuario ajusta parámetros (valores por defecto precargados)
2. Al submitear, se envía `POST /simulacion` que retorna inmediatamente
3. Se inicia un **polling** cada 1.5s a `GET /simulacion/progreso`
4. El panel muestra dos barras de progreso animadas (días e iteraciones)
5. Cuando `status === "done"`:
   - Se obtienen stats globales, datos del día 1, y último registro
   - Se guardan en `SimulationContext`
   - Se muestra toast de éxito
   - Se navega automáticamente a `/stats`

**Componentes internos:**
- `TimeInputPair` — Dos inputs sincronizados (minutos ↔ HH:MM)
- `TimeRangeField` — Wrapper con `Controller` de react-hook-form
- `FormField` — Input numérico genérico con validación
- `ProgressPanel` — Panel con dos barras de progreso (días e iteraciones)

#### Statistics (`/stats`)

**Responsabilidad:** Tarjetas con estadísticas globales de la simulación.

Muestra: total días, autos y camionetas atendidos, promedios de espera, porcentaje de bloqueo, tiempo de ejecución, hora promedio de fin de jornada.

#### Table (`/table`)

**Responsabilidad:** Vector de estado paginado con navegación por día.

**Tecnologías usadas:**
- `@tanstack/react-table` para tabla virtualizada
- Paginación manual contra el backend (offset/limit)
- Selector de día con navegación
- Botón "Guardar CSV"

#### Graph (`/graph`)

**Responsabilidad:** Gráficos comparativos interactivos.

**Tecnologías usadas:**
- `recharts` (BarChart, ScatterChart, LineChart, etc.)
- Datos de `GET /estadisticas` y `GET /estadisticas/top_bloqueo`

### 5.11 Dark Mode

**Implementación completa:**

1. **Tailwind** configurado con `darkMode: "class"`
2. **ThemeContext** agrega/remueve clase `dark` en `document.documentElement`
3. **Persistencia** en `localStorage` con key `"rtv-theme"`
4. **Default:** `"dark"` (dark mode por defecto)
5. **Toggle:** Botón en el Navbar con íconos Sun/Moon de Lucide
6. **Patrón en JSX:** Todas las clases tienen variante `dark:*`:
   ```jsx
   className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
   ```

### 5.12 Notificaciones Toast

Se usa **Sonner** como sistema de toasts:

```jsx
// main.jsx — Toaster global
import { Toaster } from 'sonner'

<StrictMode>
  <App />
  <Toaster richColors position="top-right" />
</StrictMode>
```

```jsx
// En cualquier componente
import { toast } from "sonner";

toast.success("¡Simulación concretada con éxito!", {
    description: `${totalDias} días simulados en ${tiempoEjecucion}`,
});

toast.error("Error en la simulación", {
    description: detail,
});
```

---

## 6. Docker y Docker Compose

### 6.1 Dockerfile del Backend

```dockerfile
# Etapa de construcción (instala dependencias con uv)
FROM ghcr.io/astral-sh/uv:python3.11-alpine AS builder
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Etapa de producción
FROM python:3.11-alpine
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
COPY . .
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
EXPOSE 8000
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Puntos clave:**
- **Multi-stage build**: La imagen final no tiene `uv`, solo el `.venv` compilado
- Se copian primero los archivos de dependencias para aprovechar la **caché de Docker**
- `--frozen` asegura que se use el lockfile exacto
- `--no-dev` excluye dependencias de desarrollo

### 6.2 Dockerfile del Frontend

```dockerfile
# Build con Node
FROM node:20-alpine AS builder
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json ./
RUN pnpm install --no-frozen-lockfile
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm run build

# Producción con Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Puntos clave:**
- **Multi-stage**: Node solo se usa para el build, la imagen final es solo Nginx
- `VITE_API_URL` se inyecta como **ARG** en build-time (Vite reemplaza las variables de entorno en tiempo de compilación)
- `pnpm@9` se instala explícitamente para evitar bugs de corepack con Node 20

### 6.3 docker-compose.yml

```yaml
services:
  api:
    build:
      context: ./Api
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./Api/output:/app/output       # ← CSV accesible desde el host
    environment:
      - PYTHONUNBUFFERED=1
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8000/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  frontend:
    build:
      context: ./Frontend
      dockerfile: Dockerfile
      args:
        - VITE_API_URL=http://localhost:8000
    ports:
      - "80:80"
    environment:
      - VITE_API_URL=http://localhost:8000
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:80"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5s
```

**Puntos clave:**
- **Volumen montado** en `Api/output` para que el CSV exportado quede en el host
- **Health checks** con `wget` (disponible en Alpine)
- `VITE_API_URL` se pasa tanto como `arg` (build-time) como `environment` (runtime)
- **No hay red customizada** — Docker Compose crea una por defecto

---

## 7. Flujo Completo de la Aplicación

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUJO USUARIO                                │
│                                                                     │
│  1. Usuario abre http://localhost → redirige a /config              │
│  2. Ajusta parámetros en el formulario (react-hook-form)            │
│  3. Click "Ejecutar Simulación"                                     │
│     └─→ POST /simulacion (retorna inmediato, simula en thread)      │
│  4. Panel de progreso aparece, polling cada 1.5s                    │
│     └─→ GET /simulacion/progreso (status: running → done)           │
│  5. Al completar:                                                   │
│     ├─→ GET /estadisticas_globales → SimulationContext              │
│     ├─→ GET /simulacion?dia=1 → SimulationContext                   │
│     ├─→ GET /estadisticas → totalDias                               │
│     ├─→ GET /simulacion/ultimo_registro → lastRow                   │
│     └─→ Toast de éxito + navigate("/stats")                         │
│  6. Página Estadísticas muestra tarjetas con stats globales         │
│  7. Página Tabla muestra vector de estado paginado por día          │
│     └─→ GET /simulacion?dia=N&offset=X&limit=50                    │
│  8. Página Gráficos muestra charts comparativos                     │
│     └─→ GET /estadisticas + GET /estadisticas/top_bloqueo           │
│  9. Botón "Guardar CSV" en Tabla/Stats                              │
│     └─→ POST /simulacion/exportar → genera CSV en Api/output/       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Convenciones y Patrones Clave para Reproducir

### Backend

| Convención | Detalle |
|------------|---------|
| **Un archivo = una responsabilidad** | `api.py` solo define endpoints, `simulation.py` solo el motor, etc. |
| **Separación core/entities/events/stats** | Framework DES vs dominio vs implementaciones vs métricas |
| **Simulación en thread + polling** | El POST retorna inmediato, el GET de progreso permite seguir en tiempo real |
| **Estado en memoria global con lock** | Sin DB, todo en `_simulacion_activa` protegido por `threading.Lock` |
| **SimulationConfig como dataclass** | Todos los parámetros centralizados, sin números mágicos |
| **Eventos como clases** | Cada evento hereda de `Event(ABC)` e implementa `process() → list[Event]` |
| **FEL con heapq** | Desempate por counter para estabilidad FIFO |
| **RNG trazable** | Devuelve `(rnd, value)` para registrar en el vector de estado |
| **Exportación diferida** | Tuplas en RAM, formateo y CSV solo cuando se pide |
| **CORS explícito** | Dos orígenes: `localhost` (Docker) y `localhost:5173` (dev) |
| **Pydantic para validación** | Schemas de entrada con defaults |

### Frontend

| Convención | Detalle |
|------------|---------|
| **Vite + React (JSX, no TSX)** | JavaScript plano, sin TypeScript |
| **pnpm** como package manager | Más rápido que npm/yarn |
| **Tailwind CSS 3 con darkMode: "class"** | Todo estilizado con utilidades, dark mode manual |
| **Paleta zinc monocromática** | Aesthetic minimalista y profesional |
| **Componentes UI manuales estilo shadcn** | Sin CLI de shadcn, pero usando `cn()` y el mismo patrón |
| **Layout + Navbar fijo** | `sticky top-0` con glassmorphism (`backdrop-blur-sm`) |
| **NavLink con isActive** | Estilo activo automático del React Router |
| **Context API para estado global** | Sin Redux/Zustand — dos contextos simples bastan |
| **Capa de servicios separada** | `api.js` (Axios instance) + `simulation.service.js` (funciones wrapper) |
| **Formularios con react-hook-form** | Con `Controller` para inputs complejos |
| **Gráficos con Recharts** | Librería declarativa con buen soporte de responsive |
| **Tablas con @tanstack/react-table** | Paginación, sorting, y control manual de datos |
| **Toasts con Sonner** | `richColors`, posición `top-right` |
| **Íconos con Lucide React** | Consistentes y livianos |
| **Polling manual con setInterval** | Para el progreso de la simulación (no WebSockets) |

---

## 9. Checklist para Crear un Nuevo Proyecto Similar

### Inicializar el Backend

```bash
mkdir Api && cd Api
uv init                              # Crea pyproject.toml
uv add fastapi uvicorn pytest        # Dependencias base
mkdir core entities events stats tests output
touch core/__init__.py entities/__init__.py events/__init__.py stats/__init__.py tests/__init__.py
```

**Crear los archivos base:**
1. `core/event.py` → Clase abstracta `Event(ABC)` con `process()` y `nombre`
2. `core/fel.py` → `EventQueue` con `heapq`
3. `core/rng.py` → `TrackedRandom` con `(rnd, value)`
4. `core/state.py` → `SimulationState` (reloj, entidades, contadores)
5. `core/simulation.py` → `Simulation` con el bucle principal DES
6. `entities/` → Modelo de dominio (clases del problema)
7. `events/` → Un archivo por tipo de evento
8. `stats/tracker.py` → Métricas por día y globales
9. `stats/exporter.py` → Vector de estado en memoria
10. `api.py` → Endpoints FastAPI (POST simulacion, GET progreso, etc.)

**Levantar:**
```bash
uv run uvicorn api:app --reload
```

### Inicializar el Frontend

```bash
mkdir Frontend && cd Frontend
pnpm create vite . -- --template react    # Vite + React
pnpm add react-router-dom axios recharts @tanstack/react-table
pnpm add react-hook-form sonner lucide-react
pnpm add tailwindcss@3 postcss autoprefixer clsx tailwind-merge class-variance-authority
npx tailwindcss init -p                    # Genera tailwind.config.js + postcss.config.js
```

**Configurar:**
1. `tailwind.config.js` → `darkMode: "class"`, `content: ["./index.html", "./src/**/*.{js,jsx}"]`
2. `src/index.css` → Directivas de Tailwind + estilos base
3. `src/lib/utils.js` → Función `cn()`
4. `src/context/ThemeContext.jsx` → Dark mode con localStorage
5. `src/context/SimulationContext.jsx` → Estado global de la simulación
6. `src/services/api.js` → Instancia Axios
7. `src/services/simulation.service.js` → Funciones por endpoint
8. `src/components/Layout.jsx` → Shell con Navbar + main
9. `src/components/Navbar.jsx` → NavLink + toggle theme
10. `src/App.jsx` → BrowserRouter + Routes + Providers

**Levantar:**
```bash
pnpm dev    # http://localhost:5173
```

### Dockerizar

1. `Api/Dockerfile` → Multi-stage: `uv:python3.11-alpine` → `python:3.11-alpine`
2. `Frontend/Dockerfile` → Multi-stage: `node:20-alpine` → `nginx:alpine`
3. `docker-compose.yml` → Dos servicios + health checks + volúmenes

```bash
docker-compose up --build -d
```

---

> **Nota final:** Este proyecto demuestra que es posible construir una aplicación full-stack profesional con un stack mínimo y sin complejidad innecesaria. No hay ORM, no hay base de datos, no hay Redux, no hay TypeScript — y aún así el resultado es una aplicación robusta, performante y visualmente pulida. La clave está en la buena separación de responsabilidades y en elegir las herramientas correctas para cada problema.
