# ─────────────────────────────────────────────────────────────────────────────
# Etapa 1: dependencias — se cachea mientras package.json no cambie.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# pnpm v9 (LTS estable) explícitamente — corepack resuelve v11 que tiene
# un bug ERR_UNKNOWN_BUILTIN_MODULE con Node 20 en contextos de workspace
RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

# ─────────────────────────────────────────────────────────────────────────────
# Etapa 2: build — genera los estáticos optimizados con Vite.
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

# Variables inyectadas en tiempo de build para Vite
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm run build

# ─────────────────────────────────────────────────────────────────────────────
# Etapa 3: runtime — Nginx sirviendo solo los estáticos (sin Node).
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
