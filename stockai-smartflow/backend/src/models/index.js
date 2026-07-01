'use strict';
const sequelize = require('../config/database');

// ── Importar modelos ───────────────────────────────────────────────────────────
const User           = require('./User');
const Product        = require('./Product');
const Batch          = require('./Batch');
const StockThreshold = require('./StockThreshold');
const Alert          = require('./Alert');
const AuditLog       = require('./AuditLog');

// ── Asociaciones (FK relationships) ──────────────────────────────────────────

// User → AuditLog (quién hizo cada acción)
User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'actor' });

// Product → Batch (1 producto tiene N lotes)
Product.hasMany(Batch, { foreignKey: 'product_id', as: 'batches' });
Batch.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

// Product → StockThreshold (1:1 — umbral de stock crítico)
Product.hasOne(StockThreshold, { foreignKey: 'product_id', as: 'threshold' });
StockThreshold.belongsTo(Product, { foreignKey: 'product_id' });

// Product → Alert (1 producto puede tener N alertas activas)
Product.hasMany(Alert, { foreignKey: 'product_id', as: 'alerts' });
Alert.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

module.exports = {
  sequelize,
  User,
  Product,
  Batch,
  StockThreshold,
  Alert,
  AuditLog,
};
