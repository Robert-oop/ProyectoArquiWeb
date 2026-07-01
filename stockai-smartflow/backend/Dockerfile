# ═══════════════════════════════════════════════════════════════════
# StockAI Backend — Dockerfile Multi-Stage (Node.js 20 LTS)
# Stages: base → development → test → production
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: base ────────────────────────────────────────────────────
FROM node:20-alpine AS base

LABEL maintainer="StockAI Engineering <dev@stockai.cl>"
LABEL org.opencontainers.image.title="StockAI Backend"
LABEL org.opencontainers.image.version="1.0.0"

# Dependencias OS mínimas (incluye curl para healthcheck)
RUN apk add --no-cache curl dumb-init

WORKDIR /app

# Copiar solo manifests para cachear dependencias
COPY package*.json ./

# ── Stage 2: development ──────────────────────────────────────────────
FROM base AS development

ENV NODE_ENV=development

RUN npm ci                          # install dev + prod deps

COPY . .

EXPOSE 3000

# dumb-init maneja señales POSIX correctamente (SIGTERM para graceful shutdown)
CMD ["dumb-init", "node", "node_modules/.bin/nodemon", "server.js"]


# ── Stage 3: test ─────────────────────────────────────────────────────
FROM development AS test

ENV NODE_ENV=test

RUN npm test                        # falla el build si los tests no pasan


# ── Stage 4: production ───────────────────────────────────────────────
FROM base AS production

ENV NODE_ENV=production

# Solo dependencias de producción (sin devDependencies)
RUN npm ci --omit=dev && \
    npm cache clean --force

COPY . .

# Usuario no-root para seguridad
RUN addgroup -S stockai && \
    adduser  -S stockai -G stockai && \
    chown -R stockai:stockai /app

USER stockai

EXPOSE 3000

# Healthcheck interno (Kubernetes también lo usa como readiness probe)
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["dumb-init", "node", "server.js"]
