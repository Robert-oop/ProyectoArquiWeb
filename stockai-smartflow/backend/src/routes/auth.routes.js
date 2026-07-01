'use strict';
const router      = require('express').Router();
const AuthService = require('../services/auth.service');
const { authenticate }  = require('../middleware/auth.middleware');
const { validate }      = require('../middleware/validate.middleware');
const { loginSchema, refreshSchema } = require('../schemas/auth.schema');

/**
 * CORRECCIÓN: el archivo original no usaba los schemas Joi del Paso 3.
 * Ahora todos los endpoints que reciben body tienen validación antes del handler.
 */

// POST /api/v1/auth/login
router.post('/login',
  validate(loginSchema),
  async (req, res, next) => {
    try {
      const { email, password, mfa_code } = req.body;
      const result = await AuthService.login({ email, password, mfaCode: mfa_code || '' });
      res.json(result);
    } catch (e) { next(e); }
  }
);

// POST /api/v1/auth/refresh
router.post('/refresh',
  validate(refreshSchema),
  async (req, res, next) => {
    try {
      const result = await AuthService.refresh(req.body.refresh_token);
      res.json(result);
    } catch (e) { next(e); }
  }
);

// GET /api/v1/auth/me
router.get('/me', authenticate, (req, res) => res.json(req.user.toSafeJSON()));

// POST /api/v1/auth/logout
router.post('/logout', authenticate, (_req, res) => res.status(204).send());

// POST /api/v1/auth/change-password — requiere sesión activa + contraseña actual
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ status: 400, error: 'VALIDATION_ERROR', message: 'Se requieren current_password y new_password.' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ status: 400, error: 'VALIDATION_ERROR', message: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    }
    const result = await AuthService.changePassword(req.user.id, current_password, new_password);
    res.json(result);
  } catch (e) { next(e); }
});

module.exports = router;
