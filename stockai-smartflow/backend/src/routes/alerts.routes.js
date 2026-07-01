'use strict';
const router      = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const alertsCtrl  = require('../controllers/alerts.controller');

// GET  /api/v1/alerts         — listar alertas (filtros: type, resolved, limit, page)
// GET  /api/v1/alerts/:id     — detalle de una alerta
// PATCH /api/v1/alerts/:id/resolve — marcar como resuelta

router.get('/',                   authenticate, alertsCtrl.list);
router.post('/run-stock-check',   authenticate, alertsCtrl.runStockCheck);
router.get('/:id',                authenticate, alertsCtrl.getById);
router.patch('/:id/resolve',      authenticate, alertsCtrl.resolve);

module.exports = router;
