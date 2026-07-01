'use strict';
const router = require('express').Router();
const { authenticate, authorize, audit } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { ROLES } = require('../config/constants');

// ── Controladores (stubs → conectar cuando se implemente cada controller) ────
// Se usan funciones inline para mantener el esqueleto funcional sin archivos extra
const BatchService = require('../services/batch.service');
const { Errors }   = require('../middleware/error.middleware');

const ALL   = Object.values(ROLES);
const STAFF = [ROLES.ADMIN, ROLES.MANAGER];

/* GET /api/v1/batches/expiring — Lotes próximos a activar alerta FEFO */
router.get('/expiring',
  authenticate,
  async (req, res, next) => {
    try {
      const { days = 30, limit = 50, productId } = req.query;
      const data = await BatchService.getExpiringBatches({ days: +days, limit: +limit, productId });
      res.json({ data, meta: { count: data.length } });
    } catch (e) { next(e); }
  }
);

/* GET /api/v1/batches/:id — Detalle de lote */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { Batch } = require('../models');
    const batch = await Batch.findByPk(req.params.id, { include: ['product'] });
    if (!batch) throw Errors.notFound('Batch', req.params.id);
    res.json(batch);
  } catch (e) { next(e); }
});

/* PATCH /api/v1/batches/:id/consume — Repositor despacha lote a zona ventas */
router.patch('/:id/consume',
  authenticate,
  audit('BATCH_CONSUMED', 'Batch'),
  async (req, res, next) => {
    try {
      const { quantity = 1 } = req.body;
      const updated = await BatchService.consumeBatch(req.params.id, {
        quantity: +quantity,
        consumedBy: req.user.id,
      });
      res.json(updated);
    } catch (e) { next(e); }
  }
);

/* DELETE /api/v1/batches/:id — Anular lote por merma */
router.delete('/:id',
  authenticate,
  authorize(...STAFF),
  audit('BATCH_VOID', 'Batch'),
  async (req, res, next) => {
    try {
      const { reason, affected_qty } = req.body;
      await BatchService.voidBatch(req.params.id, {
        reason,
        affectedQty: affected_qty,
        voidedBy: req.user.id,
      });
      res.status(204).send();
    } catch (e) { next(e); }
  }
);

module.exports = router;
