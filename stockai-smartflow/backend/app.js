'use strict';
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const logger       = require('./src/config/logger');
const { errorHandler, notFound } = require('./src/middleware/error.middleware');

// ── Routers ────────────────────────────────────────────────────────────────────
const authRoutes     = require('./src/routes/auth.routes');
const productRoutes  = require('./src/routes/products.routes');
const batchRoutes    = require('./src/routes/batches.routes');
const alertRoutes    = require('./src/routes/alerts.routes');
const stockRoutes    = require('./src/routes/stock.routes');
const aiRoutes       = require('./src/routes/ai.routes');
const userRoutes     = require('./src/routes/users.routes');
const auditRoutes    = require('./src/routes/audit.routes');

const app = express();

/* ─── Seguridad base ─────────────────────────────────────────────────────────── */
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false, // desactivado para Swagger UI en dev
}));

app.use(cors({
  origin:      (process.env.CORS_ORIGINS || 'http://localhost:8080').split(','),
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
}));

/* ─── Rate limiting global ───────────────────────────────────────────────────── */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,            // 1 minuto
  max:      parseInt(process.env.RATE_LIMIT || '100'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { status: 429, error: 'TOO_MANY_REQUESTS', message: 'Rate limit excedido.' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_AUTH || '10'),
  message: { status: 429, error: 'AUTH_RATE_LIMIT', message: 'Demasiados intentos de login.' },
});

app.use(globalLimiter);

/* ─── Parsers y logging ──────────────────────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));          // JSON body (+ imágenes base64 hasta 10MB)
app.use(express.urlencoded({ extended: true }));

app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip:   (req) => req.url === '/health',          // no loguear health checks
}));

/* ─── Request ID (trazabilidad) ──────────────────────────────────────────────── */
app.use((req, _res, next) => {
  req.requestId = req.headers['x-request-id'] || require('uuid').v4();
  next();
});

/* ─── Health check (Kubernetes liveness/readiness probe) ─────────────────────── */
app.get('/health', (_req, res) =>
  res.json({ status: 'healthy', service: 'stockai-backend', version: '1.0.0' })
);

/* ─── Rutas API v1 ───────────────────────────────────────────────────────────── */
const API = '/api/v1';

app.use(`${API}/auth`,     authLimiter, authRoutes);
app.use(`${API}/products`, productRoutes);
app.use(`${API}/batches`,  batchRoutes);
app.use(`${API}/alerts`,   alertRoutes);
app.use(`${API}/stock`,    stockRoutes);
app.use(`${API}/ai`,       aiRoutes);
app.use(`${API}/users`,    userRoutes);
app.use(`${API}/audit`,    auditRoutes);

/* ─── Error handlers ─────────────────────────────────────────────────────────── */
app.use(notFound);        // 404 para rutas no definidas
app.use(errorHandler);    // manejador global de errores (formatea respuesta estándar)

module.exports = app;
