'use strict';
const { Product, StockThreshold, sequelize } = require('../models');
const { BATCH_STATUS, PAGINATION, STOCK_STATUS } = require('../config/constants');
const { Errors } = require('../middleware/error.middleware');
const { QueryTypes } = require('sequelize');

/* ── GET /stock/critical ─────────────────────────────────────────────────────
 * Raw query porque Product.total_stock es DataTypes.VIRTUAL en el modelo,
 * lo que genera un conflicto cuando Sequelize intenta mapear la columna
 * agregada (SUM) al mismo nombre en el resultado.
 * ─────────────────────────────────────────────────────────────────────────── */
exports.getCritical = async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit, 10) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const page   = Math.max(parseInt(req.query.page,  10) || 1, 1);
    const offset = (page - 1) * limit;

    const rows = await sequelize.query(`
      SELECT
        p.id, p.sku, p.barcode, p.name, p.category,
        p.price_cost, p.price_sale, p.unit, p.location,
        p.vida_util_promedio_dias, p.algorithm,
        p.imagen_ref_url, p.notes, p.is_active,

        t.id            AS "threshold.id",
        t.product_id    AS "threshold.product_id",
        t.critical_stock AS "threshold.critical_stock",
        t.min_order_qty  AS "threshold.min_order_qty",

        COALESCE(SUM(b.quantity), 0)::integer AS total_stock,
        MIN(b.expiry_date)                    AS nearest_expiry,
        MIN(b.fecha_alerta)                   AS nearest_alert

      FROM products p
      INNER JOIN stock_thresholds t ON p.id = t.product_id
      LEFT JOIN batches b ON p.id = b.product_id
        AND b.deleted_at IS NULL
        AND b.status = :status
      WHERE p.deleted_at IS NULL
        AND p.is_active = true
      GROUP BY p.id, t.id
      HAVING COALESCE(SUM(b.quantity), 0) <= t.critical_stock
      ORDER BY p.name ASC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { status: BATCH_STATUS.ACTIVE, limit, offset },
      type: QueryTypes.SELECT,
    });

    const today = new Date();
    const msPerDay = 86_400_000;

    const enriched = rows.map(r => {
      const threshold = {
        id:             r['threshold.id'],
        product_id:     r['threshold.product_id'],
        critical_stock: r['threshold.critical_stock'],
        min_order_qty:  r['threshold.min_order_qty'],
      };

      const daysToExpiry = r.nearest_expiry
        ? Math.ceil((new Date(r.nearest_expiry) - today) / msPerDay)
        : null;

      const fefoAlertActive = r.nearest_alert
        ? today >= new Date(r.nearest_alert)
        : false;

      return {
        id:                   r.id,
        sku:                  r.sku,
        barcode:              r.barcode,
        name:                 r.name,
        category:             r.category,
        price_cost:           r.price_cost,
        price_sale:           r.price_sale,
        unit:                 r.unit,
        location:             r.location,
        vida_util_promedio_dias: r.vida_util_promedio_dias,
        algorithm:            r.algorithm,
        imagen_ref_url:       r.imagen_ref_url,
        notes:                r.notes,
        threshold,
        total_stock:          r.total_stock,
        nearest_expiry:       r.nearest_expiry,
        stock_status:         r.total_stock <= 0 ? STOCK_STATUS.CRITICAL : STOCK_STATUS.LOW,
        days_to_expiry:       daysToExpiry,
        fefo_alert_active:    fefoAlertActive,
      };
    });

    res.json({ data: enriched, meta: { count: enriched.length, page } });
  } catch (e) { next(e); }
};

/* ── GET /stock/:id/threshold ───────────────────────────────────────────── */
exports.getThreshold = async (req, res, next) => {
  try {
    const t = await StockThreshold.findOne({ where: { product_id: req.params.id } });
    if (!t) throw Errors.notFound('StockThreshold', req.params.id);
    res.json(t);
  } catch (e) { next(e); }
};

/* ── PUT /stock/:id/threshold ───────────────────────────────────────────── */
exports.updateThreshold = async (req, res, next) => {
  try {
    const { critical_stock, min_order_qty } = req.body;
    const [t] = await StockThreshold.upsert({
      product_id:    req.params.id,
      critical_stock,
      min_order_qty,
    });
    res.json(t);
  } catch (e) { next(e); }
};
