'use strict';
const Redis  = require('ioredis');
const logger = require('./logger');

// ── Cliente singleton ──────────────────────────────────────────────────────────
// Se conecta al iniciar el servidor. Toda la app importa esta instancia.
// Usos en StockAI:
//   - Blacklist de JWT tokens (logout, rotación de refresh token)
//   - Rate limiting por usuario (rateLimit.middleware.js)
//   - Cache de queries frecuentes (próxima fase)
//   - Pub/Sub para alertas en tiempo real (próxima fase)

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
  // Reconexión automática con backoff exponencial
  retryStrategy: (times) => {
    if (times > 10) {
      logger.error('[REDIS] No se pudo reconectar después de 10 intentos.');
      return null; // detener reintentos
    }
    const delay = Math.min(times * 200, 3000); // máx 3 segundos entre reintentos
    return delay;
  },
  // Timeout de comandos (ms)
  commandTimeout: 5000,
  // No lanzar error si Redis no está disponible al arrancar en dev
  lazyConnect: false,
  // Nombre del cliente para identificarlo en logs de Redis
  connectionName: 'stockai-backend',
});

redis.on('connect',   ()    => logger.info('[REDIS] Conectado.'));
redis.on('ready',     ()    => logger.debug('[REDIS] Listo para comandos.'));
redis.on('error',     (err) => logger.error(`[REDIS] Error: ${err.message}`));
redis.on('close',     ()    => logger.warn('[REDIS] Conexión cerrada.'));
redis.on('reconnecting', (ms) => logger.warn(`[REDIS] Reconectando en ${ms}ms…`));

// ── Helpers de uso frecuente ───────────────────────────────────────────────────

/**
 * Guardar token en blacklist al hacer logout.
 * TTL = tiempo restante del token (en segundos).
 */
async function blacklistToken(jti, ttlSeconds) {
  await redis.set(`blacklist:${jti}`, '1', 'EX', ttlSeconds);
}

/**
 * Verificar si un token está en la blacklist.
 */
async function isBlacklisted(jti) {
  const val = await redis.get(`blacklist:${jti}`);
  return val !== null;
}

/**
 * Guardar refresh token para rotación.
 * key = userId, value = refreshToken, TTL = 7 días.
 */
async function saveRefreshToken(userId, token) {
  await redis.set(`refresh:${userId}`, token, 'EX', 60 * 60 * 24 * 7);
}

async function getRefreshToken(userId) {
  return redis.get(`refresh:${userId}`);
}

async function deleteRefreshToken(userId) {
  return redis.del(`refresh:${userId}`);
}

module.exports = {
  redis,                 // cliente raw para usar comandos directamente
  blacklistToken,
  isBlacklisted,
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
};
