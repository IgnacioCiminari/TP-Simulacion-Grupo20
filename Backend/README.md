# Backend en Rust — Simulación RTV

Reimplementación en Rust del backend de `Api/` (Python + FastAPI). Mantiene:

- **La misma organización de carpetas** (`core/`, `entities/`, `events/`, `stats/`, `tests/`).
- **La misma API HTTP** (endpoints, parámetros, códigos de error y formato JSON), así que el Frontend funciona sin cambios.
- **Los mismos resultados, bit a bit**: el RNG es un Mersenne Twister con la misma siembra que `random.Random` de Python. Las respuestas de todos los endpoints y el CSV exportado son idénticos a los de la versión en Python.

## Equivalencia de archivos

| Python (`Api/`)            | Rust (`Backend/`)              |
|----------------------------|--------------------------------|
| `api.py`                   | `src/api.rs`                   |
| `uvicorn api:app`          | `src/main.rs` (binario `rtv-backend`) |
| `main.py`                  | `src/bin/simular.rs` (binario `simular`) |
| `core/*.py`                | `src/core/*.rs`                |
| `entities/*.py`            | `src/entities/*.rs`            |
| `events/*.py`              | `src/events/*.rs`              |
| `stats/*.py`               | `src/stats/*.rs`               |
| `tests/test_*.py`          | `tests/test_*.rs`              |
| `pyproject.toml` / `uv.lock` | `Cargo.toml` / `Cargo.lock`  |

## Por qué es más rápido

1. **Código compilado**: eventos como `enum` (sin objetos en el heap), vehículos en un arena indexado por id y FEL con `BinaryHeap`.
2. **Días en paralelo** (`rayon`): cada día tiene una semilla propia derivada de la maestra, así que los días son independientes. Se simulan por lotes en todos los núcleos y se acumulan en orden, evaluando las condiciones de corte día por día. El resultado es idéntico al secuencial (hay un test que lo verifica).
3. **Vector de estado bajo demanda**: durante la corrida solo se guardan las estadísticas de cada día. Cuando el front pide la tabla de un día, ese día se vuelve a simular con su semilla (microsegundos) y produce exactamente las mismas filas. La memoria pasa de O(filas) a O(días).
4. **Export CSV en paralelo** por bloques de días.
5. **mimalloc** como allocator: el `malloc` de musl (imagen alpine) es varias veces más lento y no escala con hilos.

### Benchmark (misma máquina, 8 núcleos)

| Escenario                          | Python | Rust |
|------------------------------------|--------|------|
| 680 días / 100k filas (default del front), API | 3.3 – 8 s | 0.01 – 0.03 s |
| 6.841 días / 1M filas (CLI)        | 31.3 s | 0.06 s |
| 68.486 días / 10M filas (CLI)      | —      | 0.41 s |
| 1.000.000 días / 146M filas (CLI)  | —      | 13.9 s (~0.9 GB RAM) |
| Export CSV de 100k filas (49 MB)   | 13.6 s | 1.2 s |

## Ejecución

### Docker (recomendado)

Desde la raíz del repo: `docker compose up --build -d` (usa `docker-compose.yml`).

El Dockerfile es multi-stage:
1. `deps`: compila solo las dependencias (queda en caché mientras no cambie `Cargo.lock`).
2. `builder`: compila el crate.
3. `runtime`: `alpine` con los binarios estáticos (imagen de ~16 MB).

### Local (requiere [rustup](https://rustup.rs))

```bash
cd Backend
cargo run --release                          # API en http://localhost:8000
cargo run --release --bin simular -- 10 1000 # CLI: max_dias max_iteraciones [--quiet]
cargo test --release                         # tests
```

Variables de entorno del servidor: `HOST` (default `0.0.0.0`) y `PORT` (default `8000`).

### Sin Rust instalado (compilar y testear con Docker)

```bash
docker run --rm -v "$PWD:/app" -w /app rust:1.93-alpine \
  sh -c "apk add -q musl-dev gcc && cargo test --release"
```

## Diferencias de comportamiento respecto de Python

- Si se lanza un `POST /simulacion` mientras otra simulación está corriendo, la anterior se **cancela** (en Python seguía corriendo en segundo plano y competía por el lock).
- El progreso (`/simulacion/progreso`) se actualiza por lotes de días en lugar de día por día. Como la simulación es mucho más rápida, en la práctica no se nota.
