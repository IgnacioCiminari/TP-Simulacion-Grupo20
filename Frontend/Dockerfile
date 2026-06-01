# Etapa de construcción (Build)
FROM node:20-alpine AS builder

# Instalar pnpm v9 (LTS estable) explícitamente — corepack resuelve v11 que tiene
# un bug ERR_UNKNOWN_BUILTIN_MODULE con Node 20 en contextos de workspace
RUN npm install -g pnpm@9

WORKDIR /app

# Copiar configuración de dependencias
COPY package.json pnpm-lock.yaml ./

# Instalar todas las dependencias
RUN pnpm install --frozen-lockfile

# Copiar el código fuente
COPY . .

# Inyectar variables de entorno en tiempo de construcción para Vite
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Construir la aplicación optimizada para producción
RUN pnpm run build

# Etapa de producción (Servidor web ultra ligero)
FROM nginx:alpine

# Copiar los archivos estáticos generados al directorio de nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Exponer el puerto por defecto de nginx
EXPOSE 80

# Comando para iniciar nginx
CMD ["nginx", "-g", "daemon off;"]
