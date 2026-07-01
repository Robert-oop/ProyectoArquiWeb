'use strict';
const BatchService = require('../services/batch.service');
const { Batch }    = require('../models');
const { Errors }   = require('../middleware/error.middleware');

exports.getExpiring = async (req, res, next) => {
  try {
    const { days = 30, limit = 50, productId } = req.query;
    const data = await BatchService.getExpiringBatches({ days: +days, limit: +limit, productId });
    res.json({ data, meta: { count: data.length } });
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    const batch = await Batch.findByPk(req.params.id, { include: ['product'] });
    if (!batch) throw Errors.notFound('Batch', req.params.id);
    res.json(batch);
  } catch (e) { next(e); }
};

exports.consume = async (req, res, next) => {
  try {
    const updated = await BatchService.consumeBatch(req.params.id, {
      quantity:   +(req.body.quantity ?? 1),
      consumedBy: req.user.id,
    });
    res.json(updated);
  } catch (e) { next(e); }
};

exports.void = async (req, res, next) => {
  try {
    await BatchService.voidBatch(req.params.id, {
      reason:      req.body.reason,
      affectedQty: req.body.affected_qty,
      voidedBy:    req.user.id,
    });
    res.status(204).send();
  } catch (e) { next(e); }
};