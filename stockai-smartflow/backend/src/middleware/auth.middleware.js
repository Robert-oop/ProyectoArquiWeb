'use strict';
// ═══════════════════════════════════════════════════════════
// Middlewares de Autenticación, RBAC y Auditoría
// ═══════════════════════════════════════════════════════════
const jwt    = require('jsonwebtoken');
const { User } = require('../models');
const { Errors } = require('./error.middleware');
const { AuditLog } = require('../models');

/* ─── AUTH: Verificar JWT Bearer ────────────────────────────────────────────── */
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw Errors.unauthorized('Token ausente.');

    const token   = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findOne({ where: { id: payload.sub, is_active: true } });
    if (!user) throw Errors.unauthorized('Usuario no encontrado o inactivo.');

    req.user = user;
    next();
  } catch (err) {
    next(err.isOperational ? err : Errors.unauthorized(err.message));
  }
}

/* ─── RBAC: Control de Acceso por Rol ───────────────────────────────────────── */
function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(Errors.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(Errors.forbidden(`Rol ${req.user.role} no tiene acceso a este recurso.`));
    }
    next();
  };
}

/* ─── AUDIT: Registrar acción en AuditLog ───────────────────────────────────── */
function audit(action, entity) {
  return async (req, _res, next) => {
    // Se ejecuta DESPUÉS del controlador usando res.on('finish')
    const original = _res.json.bind(_res);
    _res.json = async function (body) {
      original(body);
      // Solo auditar respuestas exitosas (2xx)
      if (_res.statusCode >= 200 && _res.statusCode < 300 && req.user) {
        try {
          await AuditLog.create({
            user_id:    req.user.id,
            action,
            entity,
            entity_id:  body?.id || req.params.id || null,
            new_value:  req.method !== 'GET' ? req.body : null,
            ip_address: req.ip,
            request_id: req.requestId,
          });
        } catch (e) { /* no bloquear si falla el audit */ }
      }
    };
    next();
  };
}

module.exports = { authenticate, authorize, audit };
