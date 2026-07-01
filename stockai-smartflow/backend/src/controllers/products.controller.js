'use strict';
const ProductService = require('../services/product.service');
const BatchService   = require('../services/batch.service');

exports.list = async (req, res, next) => {
  try {
    const result = await ProductService.list(req.query);
    res.json(result);
  } catch (e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    res.json(await ProductService.findById(req.params.id));
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const product = await ProductService.create(req.body);
    res.status(201).json(product);
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    res.json(await ProductService.update(req.params.id, req.body));
  } catch (e) { next(e); }
};

exports.updatePrice = async (req, res, next) => {
  try {
    res.json(await ProductService.updatePrice(req.params.id, req.body.price_sale));
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    await ProductService.softDelete(req.params.id);
    res.status(204).send();
  } catch (e) { next(e); }
};

// ── Lotes del producto (FEFO) ─────────────────────────────────────────────────
exports.getBatches = async (req, res, next) => {
  try {
    const { status, algorithm } = req.query;
    const batches = await BatchService.getBatchesByProduct(req.params.id, { status, withAlgorithm: !!algorithm });
    res.json({ data: batches });
  } catch (e) { next(e); }
};

exports.createBatch = async (req, res, next) => {
  try {
    const batch = await BatchService.createBatch({
      productId: req.params.id,
      registeredBy: req.user.id,
      ...req.body,
    });
    res.status(201).json(batch);
  } catch (e) { next(e); }
};