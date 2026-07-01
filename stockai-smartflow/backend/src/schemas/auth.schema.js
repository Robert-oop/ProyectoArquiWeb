'use strict';
const Joi = require('joi');

// ── Login ──────────────────────────────────────────────────────────────────────
const loginSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .lowercase()
    .trim()
    .required()
    .messages({
      'string.email':   'El correo electrónico no es válido.',
      'any.required':   'El correo electrónico es requerido.',
    }),

  password: Joi.string()
    .min(8)
    .max(128)
    .required()
    .messages({
      'string.min':     'La contraseña debe tener al menos 8 caracteres.',
      'any.required':   'La contraseña es requerida.',
    }),

  // MFA: 6 dígitos numéricos exactos (TOTP)
  // Opcional si el usuario tiene mfa_enabled = false (dev/testing)
  mfa_code: Joi.string()
    .pattern(/^\d{6}$/)
    .optional()
    .allow('', null)
    .messages({
      'string.pattern.base': 'El código MFA debe ser exactamente 6 dígitos numéricos.',
    }),
});

// ── Refresh token ──────────────────────────────────────────────────────────────
const refreshSchema = Joi.object({
  refresh_token: Joi.string()
    .required()
    .messages({
      'any.required': 'El refresh token es requerido.',
    }),
});

// ── Cambio de contraseña ───────────────────────────────────────────────────────
const changePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min':           'La nueva contraseña debe tener al menos 8 caracteres.',
      'string.pattern.base':  'La contraseña debe tener mayúsculas, minúsculas y números.',
    }),
  confirm_password: Joi.any()
    .valid(Joi.ref('new_password'))
    .required()
    .messages({
      'any.only': 'Las contraseñas no coinciden.',
    }),
});

module.exports = { loginSchema, refreshSchema, changePasswordSchema };
