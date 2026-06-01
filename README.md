# TP4 — Simulación Planta de Revisión Técnica Vehicular

**Asignatura:** Simulación — UTN FRBA  
**Grupo:** 20

Sistema de simulación de eventos discretos (**DES**) para una planta de Revisión Técnica Vehicular (RTV). Incluye un motor de simulación en Python (FastAPI), una interfaz web interactiva (React + Vite) y configuración lista para Docker.

---

## Descripción del Problema

Se modela la operación diaria de una planta RTV que atiende autos y camionetas desde las **08:00** hasta las **16:00 hs**. La planta cuenta con líneas de inspección secuenciales (**Frenos → Luces y Emisiones**). Las camionetas tienen prioridad sobre los autos. Si la estación de Luces está ocupada al finalizar Frenos, la estación de Frenos queda **bloqueada** hasta que Luces se libere.

**Métricas que se obtienen:**
- Tiempo promedio de espera en la cola de ingreso (por tipo de vehículo).
- Porcentaje de tiempo que cada estación de Frenos estuvo bloqueada.
- Hora real de finalización de la jornada.

---

## Estructura del Repositorio

```
TP-Simulacion-Grupo20/
│
├── docker-compose.yml         # Orquestación de los dos servicios (API + Frontend)
│
├── Api/                       # Backend — Motor de simulación + API REST (FastAPI + Python)
│   ├── Dockerfile             # Imagen de producción (multi-stage, python:3.11-alpine)
│   ├── api.py                 # Definición de endpoints FastAPI
│   ├── main.py                # Punto de entrada para ejecución por consola
│   ├── pyproject.toml         # Dependencias del proyecto (uv)
│   ├── core/                  # Motor DES (reloj, FEL, RNG, vector de estado)
│   ├── entities/              # Entidades del dominio (vehículo, estación, línea, cola)
│   ├── events/                # Implementaciones de cada tipo de evento
│   ├── stats/                 # Estadísticas y exportador a CSV
│   ├── output/                # ← Aquí se guarda vector_de_estado.csv (montado como volumen)
│   ├── tests/                 # Suite de pruebas (pytest)
│   ├── README.md              # Documentación técnica del backend
│   └── DOCUMENTACION_API.md   # Referencia completa de endpoints REST
│
└── Frontend/                  # Frontend — Interfaz web (React + Vite + Tailwind CSS)
    ├── Dockerfile             # Imagen de producción (multi-stage: node:20-alpine → nginx:alpine)
    ├── src/
    │   ├── pages/             # Config, Statistics, Table, Graph
    │   ├── components/        # Layout, Navbar, UI components
    │   ├── context/           # SimulationContext, ThemeContext
    │   └── services/          # Cliente HTTP (Axios) y servicios de simulación
    ├── package.json
    └── README.md              # Documentación técnica del frontend
```

---

## Ejecución con Docker Compose ⚡ (Recomendado)

Esta es la forma **más simple y rápida** de levantar todo el sistema. No requiere tener Python, Node ni ninguna dependencia instalada localmente — solo [**Docker Desktop**](https://www.docker.com/products/docker-desktop/).

### Prerrequisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo.

### Paso 1 — Clonar el repositorio

```bash
git clone <URL-del-repositorio>
cd TP-Simulacion-Grupo20
```

### Paso 2 — Primera vez: construir las imágenes y levantar

Desde la **raíz del proyecto** (donde está el `docker-compose.yml`):

```bash
docker-compose up --build -d
```

- `--build` compila las imágenes Docker del backend y el frontend. **Solo es necesario la primera vez**, o cuando modifiques código o los `Dockerfile`.
- `-d` corre los contenedores en segundo plano (*detached*), liberando la terminal.

> La primera vez puede tardar unos minutos mientras se descargan las imágenes base (`python:3.11-alpine`, `node:20-alpine`, `nginx:alpine`) y se compilan las dependencias.

### Paso 2b — Ejecuciones siguientes (sin recompilar)

Una vez que las imágenes ya fueron construidas, para levantar el sistema simplemente:

```bash
docker-compose up -d
```

### Paso 3 — Verificar que todo esté corriendo

#### Ver el estado de los contenedores

```bash
docker-compose ps
```

Deberías ver algo así, con ambos servicios en `running` y el health en `healthy`:

```
NAME                              STATUS          PORTS
tp-simulacion-grupo20-api-1       running (healthy)   0.0.0.0:8000->8000/tcp
tp-simulacion-grupo20-frontend-1  running (healthy)   0.0.0.0:80->80/tcp
```

> Los health checks pueden tardar hasta 30 s en pasar de `starting` a `healthy` tras el primer arranque.

#### Consultar los logs en tiempo real

```bash
# Logs de ambos servicios
docker-compose logs -f

# Solo el backend
docker-compose logs -f api

# Solo el frontend
docker-compose logs -f frontend
```

#### Probar los servicios directamente

| Servicio | URL | Respuesta esperada |
|----------|-----|--------------------|
| **Frontend** (interfaz web) | `http://localhost` | Página web de la simulación |
| **Backend** (health check) | `http://localhost:8000/` | `{"status":"online","message":"..."}` |
| **Swagger** (docs interactivas) | `http://localhost:8000/docs` | Interfaz Swagger UI |

### Paso 4 — Usar la aplicación

1. Ingresá a `http://localhost`.
2. Configurá los parámetros de la simulación en la página de **Configuración** y ejecutá.
3. Esperá que la barra de progreso llegue al 100% — serás redirigido automáticamente a **Estadísticas**.
4. Explorá la **Tabla** (vector de estado por día) y los **Gráficos** comparativos.
5. Desde la tabla o estadísticas, presioná **"Guardar CSV Local"** para escribir `Api/output/vector_de_estado.csv` directamente en tu máquina.

### Paso 5 — Detener los contenedores

```bash
# Detener sin borrar los contenedores (rearranque rápido con docker-compose up -d)
docker-compose stop

# Detener y eliminar los contenedores (requiere docker-compose up -d para volver)
docker-compose down
```


---

## Detalles de los Contenedores

### `api` — Backend FastAPI

| Propiedad | Valor |
|-----------|-------|
| Imagen base | `python:3.11-alpine` (multi-stage con `uv`) |
| Puerto | `8000` |
| Volumen | `./Api/output` → `/app/output` |
| Servidor | `uvicorn` (producción) |

El volumen montado garantiza que el archivo CSV generado desde la interfaz quede accesible en tu sistema de archivos local en `Api/output/vector_de_estado.csv`.

### `frontend` — React + Nginx

| Propiedad | Valor |
|-----------|-------|
| Imagen de build | `node:20-alpine` |
| Imagen final | `nginx:alpine` |
| Puerto | `80` (HTTP estándar) |
| Contenido servido | Bundle estático generado con `pnpm build` |

---

## Endpoints Principales de la API

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET`  | `/` | Health check |
| `POST` | `/simulacion` | Lanza la simulación en background |
| `GET`  | `/simulacion/progreso` | Estado de avance (polling hasta `done`) |
| `GET`  | `/simulacion` | Registros paginados de un día (`?dia=N&offset=0&limit=50`) |
| `GET`  | `/simulacion/ultimo_registro` | Último evento registrado |
| `POST` | `/simulacion/exportar` | Guarda el CSV en `output/vector_de_estado.csv` en el servidor |
| `GET`  | `/estadisticas` | Estadísticas de todas las jornadas |
| `GET`  | `/estadisticas/top_bloqueo` | Top N días con mayor bloqueo (`?n=10`) |
| `GET`  | `/estadisticas_globales` | Estadísticas globales agregadas |

> Para la documentación completa de cada endpoint (cuerpos, respuestas y códigos de error), consultá [`Api/DOCUMENTACION_API.md`](Api/DOCUMENTACION_API.md).

---

## Ejecución Manual (Sin Docker)

Si preferís correr cada servicio por separado sin Docker:

### Backend

**Prerrequisito:** tener [`uv`](https://docs.astral.sh/uv/) instalado.

```powershell
cd Api
uv sync
uv run uvicorn api:app --reload
```

### Frontend

**Prerrequisito:** tener [Node.js](https://nodejs.org/) y [`pnpm`](https://pnpm.io/) instalados.

```powershell
cd Frontend
pnpm install
pnpm dev
```

El frontend de desarrollo queda en `http://localhost:5173` y habla con la API en `http://localhost:8000`.

---

## Documentación Adicional

| Archivo | Contenido |
|---------|-----------|
| [`Api/README.md`](Api/README.md) | Arquitectura DES, parámetros configurables, estructura de columnas del CSV, reproducibilidad con seeds |
| [`Api/DOCUMENTACION_API.md`](Api/DOCUMENTACION_API.md) | Referencia completa de la API REST (cuerpos, respuestas, ejemplos JSON) |
| [`Frontend/README.md`](Frontend/README.md) | Descripción de páginas, componentes y dependencias del frontend |
