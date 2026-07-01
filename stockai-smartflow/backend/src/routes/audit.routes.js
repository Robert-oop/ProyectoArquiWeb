'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { ROLES } = require('../config/constants');
const stub = (msg) => (_req, res) => res.json({ message: msg, todo: 'Pendiente implementación' });

// TODO: Conectar con audit.controller.js en siguiente iteración
router.get('/',    authenticate, stub('GET /audit'));
router.get('/:id', authenticate, stub('GET /audit/:id'));
router.patch('/:id/resolve', authenticate, stub('PATCH /audit/:id/resolve'));

module.exports = router;
