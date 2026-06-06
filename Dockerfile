# Vocos AI — multi-stage Docker build
# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production image
FROM node:22-alpine
WORKDIR /app

# Backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY backend/db ./db

# Frontend static files
COPY --from=frontend-builder /app/frontend/dist ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV VOCOS_STORE_DRIVER=sqlite
ENV VOCOS_SQLITE_PATH=/data/vocos.sqlite
ENV VOCOS_MODEL_MODE=mock

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "src/run-server.mjs"]
