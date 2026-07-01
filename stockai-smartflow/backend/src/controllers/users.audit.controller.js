'use strict';
// ════════════════════════════════════════════════
// users.controller.js  (Admin only)
// ════════════════════════════════════════════════
const { User, AuditLog } = require('../models');
const { ROLES }  = require('../config/constants');
const { Errors } = require('../middleware/error.middleware');

const usersCtrl = {
  list: async (req, res, next) => {
    try {
      const { page = 1, limit = 25, role } = req.query;
      const where = {};
      if (role) where.role = role;
      const { rows, count } = await User.findAndCountAll({
        where,
        attributes: { exclude: ['password_hash', 'mfa_secret'] },
        order: [['name', 'ASC']],
        limit: +limit, offset: (+page - 1) * +limit,
      });
      res.json({ data: rows, meta: { total: count, page: +page } });
    } catch (e) { next(e); }
  },

  create: async (req, res, next) => {
    try {
      const { name, email, password, role } = req.body;
      const exists = await User.findOne({ where: { email } });
      if (exists) throw Errors.conflict(`Email ${email} ya registrado.`);
      const user = await User.create({ name, email, password_hash: password, role: role || ROLES.OPERATOR });
      res.status(201).json(user.toSafeJSON());
    } catch (e) { next(e); }
  },

  updateRole: async (req, res, next) => {
    try {
      const user = await User.findByPk(req.params.id);
      if (!user) throw Errors.notFound('User', req.params.id);
      if (!Object.values(ROLES).includes(req.body.role)) throw Errors.validation([{ field: 'role', message: 'Rol inválido.' }]);
      await user.update({ role: req.body.role });
      res.json(user.toSafeJSON());
    } catch (e) { next(e); }
  },

  deactivate: async (req, res, next) => {
    try {
      if (req.params.id === req.user.id) throw Errors.business('No puedes desactivarte a ti mismo.');
      const user = await User.findByPk(req.params.id);
      if (!user) throw Errors.notFound('User', req.params.id);
      await user.update({ is_active: false });
      res.status(204).send();
    } catch (e) { next(e); }
  },
};

// ════════════════════════════════════════════════
// audit.controller.js  (Admin only)
// ════════════════════════════════════════════════
const auditCtrl = {
  list: async (req, res, next) => {
    try {
      const { page = 1, limit = 50, action, entity, user_id, from, to } = req.query;
      const where = {};
      if (action)  where.action    = action;
      if (entity)  where.entity    = entity;
      if (user_id) where.user_id   = user_id;
      if (from || to) {
        const { Op } = require('sequelize');
        where.created_at = {};
        if (from) where.created_at[Op.gte] = new Date(from);
        if (to)   where.created_at[Op.lte] = new Date(to);
      }
      const { rows, count } = await AuditLog.findAndCountAll({
        where,
        order:  [['created_at', 'DESC']],
        limit:  Math.min(+limit, 100),
        offset: (+page - 1) * +limit,
        include: [{ association: 'actor', attributes: ['id', 'name', 'email', 'role'] }],
      });
      res.json({ data: rows, meta: { total: count, page: +page } });
    } catch (e) { next(e); }
  },
};

module.exports = { usersCtrl, auditCtrl };