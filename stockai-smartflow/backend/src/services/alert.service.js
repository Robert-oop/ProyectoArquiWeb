'use strict';
const { Op } = require('sequelize');
const { Alert, Product, Batch, StockThreshold, sequelize } = require('../models');
const { BATCH_STATUS, FEFO } = require('../config/constants');
const EmailService = require('./email.service');

class AlertService {

  /* ── Verifica si un lote activó el umbral 70/30 y crea alerta ─────────────── */
  async checkAndCreateFEFOAlert(batch, product) {
    const today     = new Date();
    const alertDate = batch.fecha_alerta ? new Date(batch.fecha_alerta) : null;
    if (!alertDate || today < alertDate) return;   // no activado aún

    // No duplicar alertas activas del mismo lote
    const exists = await Alert.findOne({ where: {
      product_id:  product.id,
      batch_id:    batch.id,
      type:        'FEFO_EXPIRY',
      is_resolved: false,
    }});
    if (exists) return;

    const alert = await Alert.create({
      product_id: product.id,
      batch_id:   batch.id,
      type:       'FEFO_EXPIRY',
      message:    `[FEFO 70/30] Lote ${batch.lot_number} de "${product.name}" activó alerta. Vence: ${batch.expiry_date}.`,
    });
    EmailService.sendAlertNotification(alert, product);
  }

  /* ── Verifica stock crítico tras consumo/baja ─────────────────────────────── */
  async checkStockCritical(productId) {
    const [product, threshold, totalStock] = await Promise.all([
      Product.findByPk(productId, { attributes: ['id', 'name', 'sku'] }),
      StockThreshold.findOne({ where: { product_id: productId } }),
      Batch.sum('quantity', { where: { product_id: productId, status: BATCH_STATUS.ACTIVE } }),
    ]);

    if (!threshold || !product) return;
    const stock     = totalStock || 0;
    if (stock > threshold.critical_stock) return;

    const alertType = stock <= 0 ? 'STOCK_CRITICAL' : 'STOCK_LOW';

    // Verificar duplicado del mismo tipo que se va a crear
    const exists = await Alert.findOne({ where: {
      product_id: productId, type: alertType, is_resolved: false,
    }});
    if (exists) return;

    const alert = await Alert.create({
      product_id: productId,
      type:       alertType,
      message:    `Stock de "${product.name}" (${product.sku}) en ${stock} uds. Umbral crítico: ${threshold.critical_stock}.`,
    });
    EmailService.sendAlertNotification(alert, product);
  }

  /* ── Resolver alerta manualmente ─────────────────────────────────────────── */
  async resolveAlert(alertId, resolvedBy) {
    const alert = await Alert.findByPk(alertId);
    if (!alert) throw new Error('Alerta no encontrada.');
    alert.is_resolved = true;
    alert.resolved_by = resolvedBy;
    alert.resolved_at = new Date();
    return alert.save();
  }

  /* ── Listar alertas (activas o resueltas según parámetro) ────────────────── */
  async getActiveAlerts({ type, limit = 50, page = 1, resolved = false } = {}) {
    // URLSearchParams serializa booleans como strings: "true" / "false"
    const isResolved = resolved === true || resolved === 'true';
    const where = {
      is_resolved: isResolved,
      ...(type ? { type } : {}),
    };
    const { rows, count } = await Alert.findAndCountAll({
      where,
      order:   [['created_at', 'DESC']],
      limit:   parseInt(limit, 10),
      offset:  (parseInt(page, 10) - 1) * parseInt(limit, 10),
      include: [{ association: 'product', attributes: ['name', 'sku', 'location'] }],
    });
    return { data: rows, meta: { total: count, page: parseInt(page, 10), limit: parseInt(limit, 10) } };
  }
}

module.exports = new AlertService();
