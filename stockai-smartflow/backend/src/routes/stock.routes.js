'use strict';
const router     = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { ROLES }  = require('../config/constants');
const stockCtrl  = require('../controllers/stock.controller');

const STAFF = [ROLES.ADMIN, ROLES.MANAGER];

// GET  /api/v1/stock/critical          — Productos bajo umbral Stock_Crítico
// GET  /api/v1/stock/:id/threshold     — Leer umbral de un producto
// PUT  /api/v1/stock/:id/threshold     — Actualizar umbral (staff)

router.get('/critical',          authenticate,                   stockCtrl.getCritical);
router.get('/:id/threshold',     authenticate,                   stockCtrl.getThreshold);
router.put('/:id/threshold',     authenticate, authorize(...STAFF), stockCtrl.updateThreshold);

module.exports = router;
