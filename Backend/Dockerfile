# ─────────────────────────────────────────────────────────────────────────────
# Etapa 1: dependencias — compila solo las dependencias de Cargo.lock para
# aprovechar la caché de Docker (no se recompilan si el código cambia).
# ─────────────────────────────────────────────────────────────────────────────
FROM rust:1.93-alpine AS deps

# gcc: necesario para compilar mimalloc (allocator global, ver src/lib.rs)
RUN apk add --no-cache musl-dev gcc

WORKDIR /app

COPY Cargo.toml Cargo.lock ./

# Fuentes vacías para que Cargo pueda resolver los targets del manifiesto
RUN mkdir -p src/bin \
    && echo "fn main() {}" > src/main.rs \
    && echo "fn main() {}" > src/bin/simular.rs \
    && touch src/lib.rs \
    && cargo build --release --locked \
    && rm -rf src

# ─────────────────────────────────────────────────────────────────────────────
# Etapa 2: build — compila el backend (binario estático con musl).
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS builder

COPY src ./src
COPY tests ./tests

# `touch` fuerza a Cargo a recompilar el crate propio sobre la caché de deps
RUN touch src/lib.rs src/main.rs src/bin/simular.rs \
    && cargo build --release --locked --bins \
    && strip target/release/rtv-backend target/release/simular

# ─────────────────────────────────────────────────────────────────────────────
# Etapa 3: runtime — imagen mínima, solo con los binarios.
# ─────────────────────────────────────────────────────────────────────────────
FROM alpine:3.20 AS runtime

WORKDIR /app

COPY --from=builder /app/target/release/rtv-backend /usr/local/bin/rtv-backend
COPY --from=builder /app/target/release/simular /usr/local/bin/simular

RUN mkdir -p /app/output

ENV HOST=0.0.0.0 \
    PORT=8000

EXPOSE 8000

CMD ["rtv-backend"]
