'use strict';
const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const { CATEGORIES, STOCK_STATUS } = require('../config/constants');

class Product extends Model {
  /** Calcula el estado del stock comparándolo con el umbral crítico */
  get stockStatus() {
    const threshold = this.critical_stock || 0;
    if (this.total_stock <= 0)          return STOCK_STATUS.CRITICAL;
    if (this.total_stock <= threshold)  return STOCK_STATUS.LOW;
    return STOCK_STATUS.NORMAL;
  }
}

Product.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  sku: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: { notEmpty: true },
  },
  barcode: {
    type: DataTypes.STRING(30),
    allowNull: true,
    unique: true,
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: { notEmpty: true, len: [2, 200] },
  },
  category: {
    type: DataTypes.ENUM(...CATEGORIES),
    allowNull: false,
    defaultValue: 'LACTEOS',
  },
  price_cost: {
    type: DataTypes.INTEGER,   // CLP — sin decimales
    allowNull: false,
    validate: { min: 0 },
  },
  price_sale: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1 },
  },
  unit: {
    type: DataTypes.ENUM('UNIT', 'BOX', 'KG', 'LITER'),
    defaultValue: 'UNIT',
  },
  location: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Formato: A3-B2 (Pasillo-Estante)',
  },
  vida_util_promedio_dias: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Días que suele durar el producto — base para cálculo fecha_alerta',
    validate: { min: 1 },
  },
  algorithm: {
    type: DataTypes.ENUM('70_30', '60_40'),
    defaultValue: '70_30',
    comment: 'Algoritmo FEFO asignado: usa 0.70 o 0.60 como factor de alerta',
  },
  // total_stock: campo virtual calculado al consultar (SUM de Batch.quantity)
  total_stock: {
    type: DataTypes.VIRTUAL,
  },
  imagen_ref_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  sequelize,
  modelName: 'Product',
  tableName: 'products',
  indexes: [
    { fields: ['sku'] },
    { fields: ['category'] },
    { fields: ['location'] },
    { fields: ['is_active'] },
  ],
});

module.exports = Product;
