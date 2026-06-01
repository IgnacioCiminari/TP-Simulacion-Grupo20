# Etapa de construcción
FROM ghcr.io/astral-sh/uv:python3.11-alpine AS builder

WORKDIR /app

# Solo copiamos los archivos de requerimientos primero para aprovechar la caché de Docker
COPY pyproject.toml uv.lock ./

# Instalamos las dependencias en un entorno virtual aislado
RUN uv sync --frozen --no-dev

# Etapa de producción ultra ligera
FROM python:3.11-alpine

WORKDIR /app

# Copiamos el entorno virtual compilado desde el builder
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Copiamos el código de la aplicación
COPY . .

# Optimizaciones de Python en producción
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

# Iniciamos Uvicorn (servidor de producción) apuntando a la app
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
