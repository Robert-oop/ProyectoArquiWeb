'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { ROLES } = require('../config/constants');
const stub = (msg) => (_req, res) => res.json({ message: msg, todo: 'Pendiente implementación' });

// TODO: Conectar con users.controller.js en siguiente iteración
router.get('/',    authenticate, stub('GET /users'));
router.get('/:id', authenticate, stub('GET /users/:id'));
router.patch('/:id/resolve', authenticate, stub('PATCH /users/:id/resolve'));

module.exports = router;
