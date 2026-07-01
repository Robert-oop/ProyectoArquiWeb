'use strict';
// ═══════════════════════════════════════════════════════════════
// BatchService — Lógica de negocio FEFO y Algoritmo 70/30
// Este es el corazón del sistema; TODA la lógica de vencimiento
// y priorización pasa por aquí.
// ═══════════════════════════════════════════════════════════════
const { Op } = require('sequelize');
const { Batch, Product, Alert, AuditLog, sequelize } = require('../models');
const { BATCH_STATUS, FEFO, MOVEMENT_TYPES } = require('../config/constants');
const { Errors } = require('../middleware/error.middleware');
const AlertService  = require('./alert.service');
const EmailService  = require('./email.service');

class BatchService {

  /* ── GET: Lotes de un producto ordenados por FEFO ─────────────────────────
   * La consulta SQL clave del sistema:
   *   ORDER BY fecha_alerta ASC  → P1 = más urgente
   * ─────────────────────────────────────────────────────────────────────── */
  async getBatchesByProduct(productId, { status = BATCH_STATUS.ACTIVE, withAlgorithm = true } = {}) {
    const batches = await Batch.findAll({
      where: { product_id: productId, status },
      order: [['fecha_alerta', 'ASC']],   // ← FEFO: primero el que vence antes
      include: [{ association: 'product', attributes: ['vida_util_promedio_dias', 'algorithm'] }],
    });

    // Enriquecer con campos virtuales calculados dinámicamente
    return batches.map((b, idx) => this._enrichBatch(b, idx + 1, withAlgorithm));
  }

  /* ── GET: Lotes próximos a vencer (activa algoritmo 70/30) ───────────────── */
  async getExpiringBatches({ days = 30, limit = 50, productId = null } = {}) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const where = {
      status:      BATCH_STATUS.ACTIVE,
      fecha_alerta: { [Op.lte]: cutoff },  // ya activaron o activarán el algoritmo
      ...(productId ? { product_id: productId } : {}),
    };

    const batches = await Batch.findAll({
      where,
      order:   [['fecha_alerta', 'ASC']],
      limit,
      include: [{ association: 'product', attributes: ['id', 'name', 'sku', 'location', 'algorithm'] }],
    });

    return batches.map((b, idx) => this._enrichBatch(b, idx + 1));
  }

  /* ── POST: Registrar nuevo lote con cálculo automático de fecha_alerta ─────
   *
   * Regla 70/30:
   *   fecha_alerta = fecha_ingreso + (vida_util_dias × 0.70)
   *
   * Ejemplo: leche fresca de 15 días de vida útil, ingresa hoy (1 Jun):
   *   fecha_alerta = 1 Jun + (15 × 0.70) = 1 Jun + 10 días = 11 Jun
   *   El sistema alerta para despacharla a partir del 11 Jun.
   * ─────────────────────────────────────────────────────────────────────── */
  async createBatch({ productId, lotNumber, quantity, manufactureDate, expiryDate, locationBodega, registeredBy }) {
    const product = await Product.findByPk(productId);
    if (!product) throw Errors.notFound('Product', productId);

    // Calcular fecha_alerta según algoritmo asignado al producto
    const factor      = product.algorithm === '60_40' ? FEFO.ALGORITHM_60_40 : FEFO.ALGORITHM_70_30;
    const vidaUtil    = product.vida_util_promedio_dias;
    const ingresoDate = new Date();
    const diasAlerta  = Math.floor(vidaUtil * factor);
    const alertDate   = new Date(ingresoDate);
    alertDate.setDate(alertDate.getDate() + diasAlerta);

    // Transacción: crear lote + audit log atómicamente
    const batch = await sequelize.transaction(async (t) => {
      const newBatch = await Batch.create({
        product_id:      productId,
        lot_number:      lotNumber,
        quantity,
        manufacture_date: manufactureDate || null,
        expiry_date:     expiryDate,
        fecha_alerta:    alertDate.toISOString().split('T')[0],
        algorithm:       product.algorithm,
        vida_util_dias:  vidaUtil,   // necesario para el hook beforeCreate
        location_bodega: locationBodega || product.location,
        status:          BATCH_STATUS.ACTIVE,
        registered_by:   registeredBy,
      }, { transaction: t });

      await AuditLog.create({
        user_id:   registeredBy,
        action:    'BATCH_CREATED',
        entity:    'Batch',
        entity_id: newBatch.id,
        new_value: { lot_number: lotNumber, quantity, expiry_date: expiryDate, fecha_alerta: newBatch.fecha_alerta },
      }, { transaction: t });

      return newBatch;
    });

    // Verificar si el nuevo lote activa alerta de vencimiento
    await AlertService.checkAndCreateFEFOAlert(batch, product);

    return this._enrichBatch(batch, 1);
  }

  /* ── PATCH: Consumir cantidad de un lote (repositor despacha a zona ventas) ─ */
  async consumeBatch(batchId, { quantity = 1, consumedBy }) {
    const batch = await Batch.findOne({
      where:   { id: batchId, status: BATCH_STATUS.ACTIVE },
      include: [{ association: 'product' }],
    });
    if (!batch) throw Errors.notFound('Batch', batchId);
    if (batch.quantity < quantity) {
      throw Errors.business(`Stock insuficiente: disponible ${batch.quantity}, solicitado ${quantity}.`);
    }

    await sequelize.transaction(async (t) => {
      batch.quantity -= quantity;
      if (batch.quantity === 0) batch.status = BATCH_STATUS.CONSUMED;
      await batch.save({ transaction: t });

      await AuditLog.create({
        user_id:   consumedBy,
        action:    'BATCH_CONSUMED',
        entity:    'Batch',
        entity_id: batchId,
        old_value: { quantity: batch.quantity + quantity },
        new_value: { quantity: batch.quantity, status: batch.status },
      }, { transaction: t });
    });

    // Re-evaluar stock crítico del producto tras el consumo
    await AlertService.checkStockCritical(batch.product_id);

    return this._enrichBatch(batch, 1);
  }

  /* ── DELETE: Baja por merma (soft delete con registro de causa) ──────────── */
  async voidBatch(batchId, { reason, affectedQty, voidedBy }) {
    const batch = await Batch.findByPk(batchId);
    if (!batch) throw Errors.notFound('Batch', batchId);
    if (batch.status !== BATCH_STATUS.ACTIVE) {
      throw Errors.business(`El lote ya está en estado ${batch.status}.`);
    }

    await sequelize.transaction(async (t) => {
      batch.status   = affectedQty >= batch.quantity ? BATCH_STATUS.VOID : BATCH_STATUS.ACTIVE;
      batch.quantity = Math.max(0, batch.quantity - (affectedQty || batch.quantity));
      batch.notes    = `MERMA: ${reason}`;
      await batch.save({ transaction: t });

      await AuditLog.create({
        user_id:   voidedBy,
        action:    'BATCH_VOID',
        entity:    'Batch',
        entity_id: batchId,
        new_value: { reason, affected_qty: affectedQty, status: batch.status },
      }, { transaction: t });
    });

    // Registrar alerta de merma y notificar por email
    const mermaAlert = await Alert.create({
      product_id: batch.product_id,
      batch_id:   batchId,
      type:       'MERMA',
      message:    `Merma: ${affectedQty || batch.quantity} uds del lote "${batch.lot_number}". Motivo: ${reason}.`,
    });
    const mermaProduct = await Product.findByPk(batch.product_id, { attributes: ['id', 'name', 'sku'] });
    EmailService.sendAlertNotification(mermaAlert, mermaProduct);

    // Verificar si la merma dejó stock bajo el umbral crítico
    await AlertService.checkStockCritical(batch.product_id);

    return batch;
  }

  /* ── PRIVATE: Enriquecer batch con campos virtuales FEFO ─────────────────── */
  _enrichBatch(batch, fefoIndex = 1, withAlgorithm = true) {
    const plain = batch.toJSON();
    const today = new Date();
    const expiry = new Date(batch.expiry_date);
    const alertDate = batch.fecha_alerta ? new Date(batch.fecha_alerta) : null;

    plain.days_to_expiry     = Math.ceil((expiry - today) / 86_400_000);
    plain.algorithm_alert    = alertDate ? today >= alertDate : false;
    plain.fefo_priority      = fefoIndex <= 1 ? 'P1' : fefoIndex <= 3 ? 'P2' : 'P3';

    // % vida útil restante (si tenemos fecha de fabricación)
    if (batch.manufacture_date) {
      const total   = expiry - new Date(batch.manufacture_date);
      const elapsed = today  - new Date(batch.manufacture_date);
      plain.life_remaining_pct = Math.max(0, Math.round((1 - elapsed / total) * 100));
    }

    return plain;
  }
}

module.exports = new BatchService();
