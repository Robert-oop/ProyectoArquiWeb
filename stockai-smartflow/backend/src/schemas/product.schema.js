'use strict';
const Joi = require('joi');

const CATEGORIES  = ['LACTEOS', 'BEBIDAS', 'PANADERIA', 'CONGELADOS', 'ACEITES', 'SNACKS', 'LIMPIEZA'];
const UNITS       = ['UNIT', 'BOX', 'KG', 'LITER'];
const ALGORITHMS  = ['70_30', '60_40'];

// ── Campos base reutilizables ──────────────────────────────────────────────────
const fields = {
  name: Joi.string().trim().min(2).max(200)
    .messages({ 'string.min': 'El nombre debe tener al menos 2 caracteres.' }),

  sku: Joi.string().trim().uppercase().max(50)
    .messages({ 'string.max': 'El SKU no puede superar 50 caracteres.' }),

  barcode: Joi.string().trim().max(30).allow(null, ''),

  category: Joi.string().valid(...CATEGORIES)
    .messages({ 'any.only': `La categoría debe ser una de: ${CATEGORIES.join(', ')}.` }),

  price_cost: Joi.number().integer().min(0)
    .messages({ 'number.min': 'El precio de costo no puede ser negativo.' }),

  price_sale: Joi.number().integer().min(1)
    .messages({ 'number.min': 'El precio de venta debe ser mayor a 0.' }),

  unit: Joi.string().valid(...UNITS),

  location: Joi.string().trim().max(20)
    .pattern(/^[A-Z]\d+-[A-Z]\d+$/)
    .messages({ 'string.pattern.base': 'El formato de ubicación debe ser Ej: A3-B2.' }),

  vida_util_promedio_dias: Joi.number().integer().min(1)
    .messages({ 'number.min': 'La vida útil promedio debe ser al menos 1 día.' }),

  algorithm: Joi.string().valid(...ALGORITHMS)
    .messages({ 'any.only': 'El algoritmo debe ser 70_30 o 60_40.' }),

  imagen_ref_url: Joi.string().uri().allow(null, ''),

  notes: Joi.string().max(1000).allow(null, ''),

  critical_stock: Joi.number().integer().min(0),
  min_order_qty:  Joi.number().integer().min(1).allow(null),
};

// ── CREATE — todos los campos requeridos ──────────────────────────────────────
const createProductSchema = Joi.object({
  name:                    fields.name.required(),
  sku:                     fields.sku.required(),
  barcode:                 fields.barcode,
  category:                fields.category.required(),
  price_cost:              fields.price_cost.required(),
  price_sale:              fields.price_sale.required(),
  unit:                    fields.unit.required(),
  location:                fields.location.required(),
  vida_util_promedio_dias: fields.vida_util_promedio_dias.required(),
  algorithm:               fields.algorithm.required(),
  imagen_ref_url:          fields.imagen_ref_url,
  notes:                   fields.notes,
  // Threshold inline al crear
  critical_stock:          fields.critical_stock,
  min_order_qty:           fields.min_order_qty,
}).custom((obj, helpers) => {
  // Regla de negocio: precio de venta debe ser mayor al costo
  if (obj.price_sale !== undefined && obj.price_cost !== undefined) {
    if (obj.price_sale <= obj.price_cost) {
      return helpers.error('any.invalid', {
        message: 'El precio de venta debe ser mayor al precio de costo.',
      });
    }
  }
  return obj;
});

// ── UPDATE — todos opcionales (PATCH parcial también usa este schema) ─────────
const updateProductSchema = Joi.object({
  name:                    fields.name,
  barcode:                 fields.barcode,
  category:                fields.category,
  price_cost:              fields.price_cost,
  price_sale:              fields.price_sale,
  unit:                    fields.unit,
  location:                fields.location,
  vida_util_promedio_dias: fields.vida_util_promedio_dias,
  algorithm:               fields.algorithm,
  imagen_ref_url:          fields.imagen_ref_url,
  notes:                   fields.notes,
  critical_stock:          fields.critical_stock,
  min_order_qty:           fields.min_order_qty,
}).min(1).messages({ 'object.min': 'Debes enviar al menos un campo para actualizar.' });

// ── PATCH price — solo precio de venta ───────────────────────────────────────
const updatePriceSchema = Joi.object({
  price_sale: fields.price_sale.required(),
});

// ── PUT threshold — actualizar Stock_Crítico ──────────────────────────────────
const updateThresholdSchema = Joi.object({
  critical_stock: fields.critical_stock.required(),
  min_order_qty:  fields.min_order_qty,
  reason:         Joi.string().max(500).allow(null, ''),   // se guarda en AuditLog
});

// ── GET list — query params de filtro ─────────────────────────────────────────
const listProductsSchema = Joi.object({
  page:      Joi.number().integer().min(1).default(1),
  limit:     Joi.number().integer().min(1).max(100).default(25),
  search:    Joi.string().trim().max(100).allow(''),
  category:  Joi.string().valid(...CATEGORIES).allow(''),
  status:    Joi.string().valid('NORMAL', 'LOW', 'CRITICAL').allow(''),
  location:  Joi.string().trim().max(10).allow(''),
  expiring:  Joi.string().valid('true', 'false').allow(''),
  algorithm: Joi.string().valid(...ALGORITHMS).allow(''),
  sort:      Joi.string().valid('name', 'sku', 'price_sale', 'created_at').default('name'),
  order:     Joi.string().valid('ASC', 'DESC').default('ASC'),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  updatePriceSchema,
  updateThresholdSchema,
  listProductsSchema,
};
