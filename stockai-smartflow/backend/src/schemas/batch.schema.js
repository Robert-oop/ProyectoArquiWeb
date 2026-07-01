'use strict';
const Joi = require('joi');

// ── CREATE batch ──────────────────────────────────────────────────────────────
const createBatchSchema = Joi.object({
  lot_number: Joi.string()
    .trim()
    .uppercase()
    .max(50)
    .required()
    .messages({
      'any.required': 'El número de lote es requerido.',
      'string.max':   'El número de lote no puede superar 50 caracteres.',
    }),

  quantity: Joi.number()
    .integer()
    .min(1)
    .required()
    .messages({
      'number.min':   'La cantidad debe ser al menos 1.',
      'any.required': 'La cantidad es requerida.',
    }),

  expiry_date: Joi.string()
    .isoDate()
    .required()
    .custom((value, helpers) => {
      // La fecha de vencimiento debe ser futura
      if (new Date(value) <= new Date()) {
        return helpers.error('date.future');
      }
      return value;
    })
    .messages({
      'any.required':   'La fecha de vencimiento es requerida.',
      'string.isoDate': 'La fecha debe estar en formato YYYY-MM-DD.',
      'date.future':    'La fecha de vencimiento debe ser posterior a hoy.',
    }),

  manufacture_date: Joi.string()
    .isoDate()
    .allow(null, '')
    .custom((value, helpers) => {
      if (!value) return value;
      // La fecha de fabricación debe ser anterior a hoy
      if (new Date(value) > new Date()) {
        return helpers.error('date.past');
      }
      return value;
    })
    .messages({
      'string.isoDate': 'La fecha de fabricación debe estar en formato YYYY-MM-DD.',
      'date.past':      'La fecha de fabricación no puede ser futura.',
    }),

  location_bodega: Joi.string()
    .trim()
    .max(20)
    .allow(null, '')
    .messages({
      'string.max': 'La ubicación no puede superar 20 caracteres.',
    }),

  notes: Joi.string().max(500).allow(null, ''),
})
// Regla de negocio: fabricación debe ser anterior al vencimiento
.custom((obj, helpers) => {
  if (obj.manufacture_date && obj.expiry_date) {
    if (new Date(obj.manufacture_date) >= new Date(obj.expiry_date)) {
      return helpers.message('La fecha de fabricación debe ser anterior a la fecha de vencimiento.');
    }
  }
  return obj;
});

// ── CONSUME batch ─────────────────────────────────────────────────────────────
const consumeBatchSchema = Joi.object({
  quantity: Joi.number()
    .integer()
    .min(1)
    .required()
    .messages({
      'number.min':   'La cantidad a consumir debe ser al menos 1.',
      'any.required': 'La cantidad a consumir es requerida.',
    }),
  notes: Joi.string().max(300).allow(null, ''),
});

// ── VOID (merma) batch ────────────────────────────────────────────────────────
const voidBatchSchema = Joi.object({
  reason: Joi.string()
    .trim()
    .min(5)
    .max(300)
    .required()
    .messages({
      'any.required': 'El motivo de la baja es requerido.',
      'string.min':   'El motivo debe tener al menos 5 caracteres.',
    }),
  affected_qty: Joi.number()
    .integer()
    .min(1)
    .allow(null)
    .messages({
      'number.min': 'La cantidad afectada debe ser al menos 1.',
    }),
});

// ── GET expiring — query params ───────────────────────────────────────────────
const getExpiringSchema = Joi.object({
  days:       Joi.number().integer().min(1).max(365).default(30),
  limit:      Joi.number().integer().min(1).max(200).default(50),
  product_id: Joi.string().uuid().allow(''),
});

module.exports = {
  createBatchSchema,
  consumeBatchSchema,
  voidBatchSchema,
  getExpiringSchema,
};
