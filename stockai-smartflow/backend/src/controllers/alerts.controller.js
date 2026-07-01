'use strict';
// ── alerts.controller.js ──────────────────────────────────────────────────────
const AlertService = require('../services/alert.service');
const { Alert }    = require('../models');
const { Errors }   = require('../middleware/error.middleware');

const { stockCheckerJob } = require('../jobs/stockChecker.job');

const alertsCtrl = {
  list: async (req, res, next) => {
    try {
      const result = await AlertService.getActiveAlerts(req.query);
      res.json(result);
    } catch (e) { next(e); }
  },

  runStockCheck: async (req, res, next) => {
    try {
      await stockCheckerJob();
      res.json({ ok: true, message: 'Verificación de stock completada.' });
    } catch (e) { next(e); }
  },

  getById: async (req, res, next) => {
    try {
      const alert = await Alert.findByPk(req.params.id, { include: ['product'] });
      if (!alert) throw Errors.notFound('Alert', req.params.id);
      res.json(alert);
    } catch (e) { next(e); }
  },

  resolve: async (req, res, next) => {
    try {
      const alert = await AlertService.resolveAlert(req.params.id, req.user.id);
      res.json(alert);
    } catch (e) { next(e); }
  },
};

module.exports = alertsCtrl;