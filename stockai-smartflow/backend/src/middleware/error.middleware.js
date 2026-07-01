'use strict';
const logger = require('../config/logger');

/* ─── Error base con código de negocio ─────────────────────────────────────── */
class AppError extends Error {
  constructor(statusCode, errorCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode  = errorCode;
    this.details    = details;
    this.isOperational = true;
  }
}

/* ─── Factory de errores comunes ────────────────────────────────────────────── */
const Errors = {
  notFound:    (entity, id)  => new AppError(404, `${entity}_NOT_FOUND`,  `No se encontró ${entity} con id: ${id}`),
  unauthorized:(msg = 'No autenticado') => new AppError(401, 'UNAUTHORIZED', msg),
  forbidden:   (msg = 'Sin permisos')   => new AppError(403, 'FORBIDDEN',    msg),
  conflict:    (msg)         => new AppError(409, 'CONFLICT',      msg),
  validation:  (details)     => new AppError(400, 'VALIDATION_ERROR', 'Datos inválidos', details),
  business:    (msg)         => new AppError(422, 'BUSINESS_RULE_VIOLATION', msg),
};

/* ─── 404 handler ────────────────────────────────────────────────────────────── */
function notFound(req, res, _next) {
  res.status(404).json({
    status:    404,
    error:     'ROUTE_NOT_FOUND',
    message:   `Ruta ${req.method} ${req.originalUrl} no existe.`,
    path:      req.originalUrl,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
}

/* ─── Global error handler (debe tener 4 parámetros para que Express lo reconozca) */
function errorHandler(err, req, res, _next) {
  // Errores de Sequelize → convertir al formato estándar
  if (err.name === 'SequelizeValidationError') {
    const details = err.errors.map((e) => ({ field: e.path, message: e.message }));
    err = Errors.validation(details);
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    err = Errors.conflict(`Registro duplicado: ${err.errors[0]?.path}`);
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    err = Errors.unauthorized('Token JWT inválido o expirado.');
  }

  const statusCode = err.statusCode || 500;
  const isServer   = statusCode >= 500;

  if (isServer) logger.error(`[${req.requestId}] ${err.message}`, { stack: err.stack });
  else          logger.warn(`[${req.requestId}] ${err.message}`);

  res.status(statusCode).json({
    status:    statusCode,
    error:     err.errorCode || 'INTERNAL_ERROR',
    message:   isServer ? 'Error interno del servidor.' : err.message,
    details:   err.details || null,
    path:      req.originalUrl,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
}

module.exports = { AppError, Errors, notFound, errorHandler };
