'use strict';
// ═══════════════════════════════════════════════════════════
// Modelos secundarios — un archivo para ahorrar tokens
// User | Alert | StockThreshold | AuditLog
// ═══════════════════════════════════════════════════════════
const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt    = require('bcryptjs');
const { ROLES } = require('../config/constants');

/* ─── USER ──────────────────────────────────────────────────────────────────── */
class User extends Model {
  async validatePassword(plain) {
    return bcrypt.compare(plain, this.password_hash);
  }
  toSafeJSON() {
    const { password_hash, mfa_secret, ...safe } = this.toJSON();
    return safe;
  }
}
User.init({
  id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name:          { type: DataTypes.STRING(100), allowNull: false },
  email:         { type: DataTypes.STRING(150), allowNull: false, unique: true,
                   validate: { isEmail: true } },
  password_hash: { type: DataTypes.TEXT, allowNull: false },
  role:          { type: DataTypes.ENUM(...Object.values(ROLES)), defaultValue: ROLES.OPERATOR },
  mfa_secret:    { type: DataTypes.STRING(64), allowNull: true },
  mfa_enabled:   { type: DataTypes.BOOLEAN, defaultValue: false },
  is_active:     { type: DataTypes.BOOLEAN, defaultValue: true },
  last_login:    { type: DataTypes.DATE, allowNull: true },
}, { sequelize, modelName: 'User', tableName: 'users',
     indexes: [{ fields: ['email'] }, { fields: ['role'] }] });

// Hash password antes de crear/actualizar
User.addHook('beforeSave', async (user) => {
  if (user.changed('password_hash')) {
    user.password_hash = await bcrypt.hash(user.password_hash, 12);
  }
});

/* ─── STOCK THRESHOLD ───────────────────────────────────────────────────────── */
class StockThreshold extends Model {}
StockThreshold.init({
  id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  product_id:     { type: DataTypes.UUID, allowNull: false,
                    references: { model: 'products', key: 'id' } },
  critical_stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0,
                    comment: 'Cantidad mínima antes de generar alerta' },
  min_order_qty:  { type: DataTypes.INTEGER, allowNull: true,
                    comment: 'Cantidad sugerida al pedir al proveedor' },
}, { sequelize, modelName: 'StockThreshold', tableName: 'stock_thresholds', paranoid: false });

/* ─── ALERT ─────────────────────────────────────────────────────────────────── */
class Alert extends Model {}
Alert.init({
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  product_id: { type: DataTypes.UUID, allowNull: false },
  type: {
    type: DataTypes.ENUM('FEFO_EXPIRY', 'STOCK_CRITICAL', 'STOCK_LOW', 'MERMA'),
    allowNull: false,
  },
  message:     { type: DataTypes.TEXT, allowNull: false },
  is_resolved: { type: DataTypes.BOOLEAN, defaultValue: false },
  resolved_by: { type: DataTypes.UUID, allowNull: true },
  resolved_at: { type: DataTypes.DATE, allowNull: true },
  batch_id:    { type: DataTypes.UUID, allowNull: true,
                 comment: 'Lote que disparó la alerta (si aplica)' },
}, { sequelize, modelName: 'Alert', tableName: 'alerts',
     indexes: [{ fields: ['product_id'] }, { fields: ['is_resolved'] }, { fields: ['type'] }] });

/* ─── AUDIT LOG ─────────────────────────────────────────────────────────────── */
class AuditLog extends Model {}
AuditLog.init({
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:     { type: DataTypes.UUID, allowNull: false },
  action:      { type: DataTypes.STRING(100), allowNull: false,
                 comment: 'Ej: BATCH_CREATED, PRODUCT_UPDATED, BATCH_CONSUMED' },
  entity:      { type: DataTypes.STRING(50),  allowNull: false,
                 comment: 'Ej: Batch, Product, Alert' },
  entity_id:   { type: DataTypes.UUID, allowNull: true },
  old_value:   { type: DataTypes.JSONB, allowNull: true },
  new_value:   { type: DataTypes.JSONB, allowNull: true },
  ip_address:  { type: DataTypes.INET, allowNull: true },
  request_id:  { type: DataTypes.STRING(50), allowNull: true },
}, { sequelize, modelName: 'AuditLog', tableName: 'audit_logs', updatedAt: false, paranoid: false,
     indexes: [{ fields: ['user_id'] }, { fields: ['entity', 'entity_id'] }, { fields: ['created_at'] }] });

module.exports = { User, StockThreshold, Alert, AuditLog };

// Re-exportar individualmente (requerido por models/index.js)
// Nota: models/index.js hace require('./User'), require('./Alert'), etc.
// Este archivo los exporta todos juntos pero index.js los importa individualmente.
// Alternativa: separar en archivos propios si crece la complejidad.
