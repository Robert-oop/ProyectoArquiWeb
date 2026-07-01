'use strict';
const { DataTypes, Model, Op } = require('sequelize');
const sequelize = require('../config/database');
const { BATCH_STATUS, FEFO } = require('../config/constants');

class Batch extends Model {
  /** Días hasta el vencimiento (puede ser negativo si ya venció) */
  get daysToExpiry() {
    if (!this.expiry_date) return null;
    return Math.ceil((new Date(this.expiry_date) - new Date()) / 86_400_000);
  }

  /** Porcentaje de vida útil restante */
  get lifeRemainingPct() {
    if (!this.manufacture_date || !this.expiry_date) return null;
    const total   = new Date(this.expiry_date)     - new Date(this.manufacture_date);
    const elapsed = new Date()                     - new Date(this.manufacture_date);
    return Math.max(0, Math.round((1 - elapsed / total) * 100));
  }

  /** True si activó el algoritmo 70/30 o 60/40 */
  get algorithmAlert() {
    const pct = this.lifeRemainingPct;
    if (pct === null) return false;
    const factor = this.algorithm === '60_40' ? FEFO.ALGORITHM_60_40 : FEFO.ALGORITHM_70_30;
    // Alerta cuando el % restante cae por debajo del umbral inverso
    return pct <= Math.round((1 - factor) * 100);  // 70/30 → alerta cuando ≤ 30%
  }
}

Batch.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  product_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'products', key: 'id' },
  },
  lot_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Ej: L2024-118',
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: { min: 0 },
  },
  manufacture_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  // fecha_alerta: calculada por hook beforeCreate/beforeUpdate
  // fecha_alerta = fecha_ingreso + (vida_util_dias × 0.70 | 0.60)
  fecha_alerta: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Regla 70/30: fecha desde la que se prioriza el despacho',
  },
  algorithm: {
    type: DataTypes.ENUM('70_30', '60_40'),
    defaultValue: '70_30',
  },
  location_bodega: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Ubicación física en bodega: pasillo/estante',
  },
  status: {
    type: DataTypes.ENUM(...Object.values(BATCH_STATUS)),
    defaultValue: BATCH_STATUS.ACTIVE,
  },
  registered_by: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'ID del usuario que registró el lote',
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Campos virtuales calculados al responder
  days_to_expiry:     { type: DataTypes.VIRTUAL },
  life_remaining_pct: { type: DataTypes.VIRTUAL },
  algorithm_alert:    { type: DataTypes.VIRTUAL },
  fefo_priority:      { type: DataTypes.VIRTUAL },
}, {
  sequelize,
  modelName: 'Batch',
  tableName: 'batches',
  indexes: [
    { fields: ['product_id'] },
    { fields: ['fecha_alerta'] },    // índice clave para ORDER BY FEFO
    { fields: ['expiry_date'] },
    { fields: ['status'] },
    { unique: true, fields: ['product_id', 'lot_number'] },
  ],
});

/* ─── Hook: Calcular fecha_alerta automáticamente al crear/actualizar ─────── */
// fecha_alerta = fecha_ingreso + (vida_util_dias × factor_algoritmo)
// NOTA: vida_util_promedio_dias viene del Product asociado.
// El service debe pasar vida_util_dias en el payload antes de llamar Batch.create()
Batch.addHook('beforeCreate', (batch) => _calcFechaAlerta(batch));
Batch.addHook('beforeUpdate', (batch) => _calcFechaAlerta(batch));

function _calcFechaAlerta(batch) {
  if (!batch.expiry_date || !batch.vida_util_dias) return;
  const factor       = batch.algorithm === '60_40' ? FEFO.ALGORITHM_60_40 : FEFO.ALGORITHM_70_30;
  const ingresoDate  = new Date(batch.createdAt || Date.now());
  const diasAlerta   = Math.floor(batch.vida_util_dias * factor);
  const alertDate    = new Date(ingresoDate);
  alertDate.setDate(alertDate.getDate() + diasAlerta);
  batch.fecha_alerta = alertDate.toISOString().split('T')[0];
}

module.exports = Batch;
