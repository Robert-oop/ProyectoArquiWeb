'use strict';
const router  = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { ROLES } = require('../config/constants');
const { Op, QueryTypes }  = require('sequelize');
const { Product, Batch } = require('../models');
const BatchService = require('../services/batch.service');
const { Errors } = require('../middleware/error.middleware');
const { sequelize } = require('../models');
const stockCtrl = require('../controllers/stock.controller');

const STAFF = [ROLES.ADMIN, ROLES.MANAGER];

// GET /api/v1/products — Lista enriquecida: stock real, estado FEFO y umbral
router.get('/', authenticate, async (req, res, next) => {
  try {
    const {
      page=1, limit=25, search, category, status,
      algorithm, sort='name', order='ASC', location,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * limitNum;

    // Whitelist de columnas permitidas para ORDER BY (prevención SQL injection)
    const VALID_SORTS = ['name','category','price_sale','price_cost','total_stock','created_at'];
    const safeSort  = VALID_SORTS.includes(sort) ? sort : 'name';
    const safeOrder = order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Condiciones del JOIN interno (sobre productos)
    const innerConds = ['p.deleted_at IS NULL', 'p.is_active = true'];
    const replacements = {};

    if (search) {
      innerConds.push(`(p.name ILIKE :search OR p.sku ILIKE :search OR COALESCE(p.barcode,'') ILIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (category)  { innerConds.push('p.category = :category');   replacements.category = category; }
    if (algorithm) { innerConds.push('p.algorithm = :algorithm'); replacements.algorithm = algorithm; }
    if (location)  { innerConds.push('p.location ILIKE :location'); replacements.location = `${location}%`; }

    // El filtro por status se aplica en la capa exterior del CTE
    const outerConds = [];
    if (status && ['CRITICAL','LOW','NORMAL'].includes(status)) {
      outerConds.push('stock_status = :status');
      replacements.status = status;
    }
    const outerWhere = outerConds.length ? `WHERE ${outerConds.join(' AND ')}` : '';

    // CTE: agrega lotes activos y calcula stock + estado por producto
    const cte = `
      WITH enriched AS (
        SELECT
          p.id, p.sku, p.barcode, p.name, p.category, p.unit, p.algorithm,
          p.vida_util_promedio_dias, p.location, p.price_cost, p.price_sale,
          p.is_active, p.created_at, p.updated_at,
          t.critical_stock,
          t.min_order_qty,
          COALESCE(SUM(b.quantity), 0)::int                                         AS total_stock,
          MIN(b.expiry_date)                                                         AS nearest_expiry,
          CASE WHEN MIN(b.fecha_alerta) IS NULL THEN false
               ELSE MIN(b.fecha_alerta) <= CURRENT_DATE END                          AS algorithm_alert,
          CASE
            WHEN t.critical_stock IS NULL                              THEN 'NORMAL'
            WHEN COALESCE(SUM(b.quantity), 0) <= t.critical_stock     THEN 'CRITICAL'
            WHEN COALESCE(SUM(b.quantity), 0) <= t.critical_stock * 2 THEN 'LOW'
            ELSE 'NORMAL'
          END                                                                         AS stock_status
        FROM products p
        LEFT JOIN batches b ON b.product_id = p.id
                            AND b.deleted_at IS NULL
                            AND b.status = 'ACTIVE'
        LEFT JOIN stock_thresholds t ON t.product_id = p.id
        WHERE ${innerConds.join(' AND ')}
        GROUP BY p.id, t.id, t.critical_stock, t.min_order_qty
      )
    `;

    const rows = await sequelize.query(
      `${cte}
       SELECT * FROM enriched ${outerWhere}
       ORDER BY ${safeSort} ${safeOrder}
       LIMIT :limitNum OFFSET :offset`,
      { replacements: { ...replacements, limitNum, offset }, type: QueryTypes.SELECT }
    );

    const countRows = await sequelize.query(
      `${cte} SELECT COUNT(*)::int AS total FROM enriched ${outerWhere}`,
      { replacements, type: QueryTypes.SELECT }
    );

    const total = countRows[0]?.total ?? 0;
    const pages = Math.ceil(total / limitNum);

    // Anidar campos del umbral en objeto threshold
    const data = rows.map(p => ({
      ...p,
      threshold: p.critical_stock != null
        ? { critical_stock: p.critical_stock, min_order_qty: p.min_order_qty }
        : null,
    }));

    res.json({ data, meta: { total, page: pageNum, limit: limitNum, pages } });
  } catch (e) { next(e); }
});

// POST /api/v1/products
router.post('/', authenticate, authorize(...STAFF), async (req, res, next) => {
  try {
    if (!req.body.sku) {
      let sku, isUnique = false;
      while (!isUnique) {
        sku = `SKU-${String(Math.floor(100000 + Math.random() * 900000))}`;
        const existing = await Product.findOne({ where: { sku }, paranoid: false });
        isUnique = !existing;
      }
      req.body.sku = sku;
    }
    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (e) { next(e); }
});

// GET /api/v1/products/generate-sku — returns a unique SKU that doesn't exist in DB
router.get('/generate-sku', authenticate, async (req, res, next) => {
  try {
    let sku, isUnique = false, attempts = 0;
    while (!isUnique && attempts < 20) {
      sku = `SKU-${String(Math.floor(100000 + Math.random() * 900000))}`;
      const existing = await Product.findOne({ where: { sku }, paranoid: false });
      isUnique = !existing;
      attempts++;
    }
    res.json({ sku });
  } catch (e) { next(e); }
});

// GET /api/v1/products/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const p = await Product.findByPk(req.params.id);
    if (!p) throw Errors.notFound('Product', req.params.id);
    res.json(p);
  } catch (e) { next(e); }
});

// PUT /api/v1/products/:id
router.put('/:id', authenticate, authorize(...STAFF), async (req, res, next) => {
  try {
    const p = await Product.findByPk(req.params.id);
    if (!p) throw Errors.notFound('Product', req.params.id);
    await p.update(req.body);
    res.json(p);
  } catch (e) { next(e); }
});

// PATCH /api/v1/products/:id/price
router.patch('/:id/price', authenticate, authorize(...STAFF), async (req, res, next) => {
  try {
    const p = await Product.findByPk(req.params.id);
    if (!p) throw Errors.notFound('Product', req.params.id);
    await p.update({ price_sale: req.body.price_sale });
    res.json({ id: p.id, price_sale: p.price_sale, updated_at: p.updatedAt });
  } catch (e) { next(e); }
});

// DELETE /api/v1/products/:id (soft delete via paranoid)
router.delete('/:id', authenticate, authorize(...STAFF), async (req, res, next) => {
  try {
    const p = await Product.findByPk(req.params.id);
    if (!p) throw Errors.notFound('Product', req.params.id);
    await p.update({ is_active: false });
    await p.destroy();
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/v1/products/:id/threshold — Umbral Stock_Crítico
router.get('/:id/threshold', authenticate, stockCtrl.getThreshold);

// PUT /api/v1/products/:id/threshold — Actualizar umbral (staff)
router.put('/:id/threshold', authenticate, authorize(...STAFF), stockCtrl.updateThreshold);

// GET /api/v1/products/:id/batches — Lotes FEFO del producto
router.get('/:id/batches', authenticate, async (req, res, next) => {
  try {
    const batches = await BatchService.getBatchesByProduct(req.params.id);
    res.json({ data: batches });
  } catch (e) { next(e); }
});

// POST /api/v1/products/:id/batches — Ingresar nuevo lote
router.post('/:id/batches', authenticate, authorize(...STAFF), async (req, res, next) => {
  try {
    const batch = await BatchService.createBatch({
      productId: req.params.id,
      registeredBy: req.user.id,
      ...req.body,
    });
    res.status(201).json(batch);
  } catch (e) { next(e); }
});

module.exports = router;
