# Imagen de la app Flota Claro para EasyPanel / cualquier host con Docker.
FROM node:22-slim

WORKDIR /app

# Instala dependencias de produccion primero (mejor cache).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copia el codigo.
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
