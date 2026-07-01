'use strict';
const { Op }    = require('sequelize');
const { Alert, Batch, Product } = require('../models');
const logger    = require('../config/logger');

/**
 * Job: Resumen diario del estado de la bodega.
 *
 * Genera estadísticas y las loguea (base para enviar email en Fase 2
 * cuando notification.service.js esté implementado).
 *
 * Corre diariamente a las 07:00 (configurado en jobs/index.js).
 */
async function dailySummaryJob() {
  const startedAt = Date.now();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Alertas activas por tipo
    const [criticalStock, lowStock, fefoExpiry] = await Promise.all([
      Alert.count({ where: { type: 'STOCK_CRITICAL', is_resolved: false } }),
      Alert.count({ where: { type: 'STOCK_LOW',      is_resolved: false } }),
      Alert.count({ where: { type: 'FEFO_EXPIRY',    is_resolved: false } }),
    ]);

    // Lotes que vencen en los próximos 7 días
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);

    const expiringThisWeek = await Batch.count({
      where: {
        status:      'ACTIVE',
        expiry_date: { [Op.between]: [new Date(), next7Days] },
      },
    });

    // Lotes ya vencidos sin procesar
    const overdueExpired = await Batch.count({
      where: {
        status:      'ACTIVE',
        expiry_date: { [Op.lt]: new Date() },
      },
    });

    // Productos activos totales
    const totalProducts = await Product.count({ where: { is_active: true } });

    const summary = {
      date:             today.toISOString().split('T')[0],
      alerts: {
        critical_stock:  criticalStock,
        low_stock:       lowStock,
        fefo_expiry:     fefoExpiry,
        total_active:    criticalStock + lowStock + fefoExpiry,
      },
      batches: {
        expiring_this_week: expiringThisWeek,
        overdue_expired:    overdueExpired,
      },
      total_products: totalProducts,
    };

    const elapsed = Date.now() - startedAt;
    logger.info('[JOB:DAILY] Resumen diario:', summary);

    // ── TODO Paso 4: descomentar cuando notification.service.js esté listo ──
    // if (criticalStock > 0 || fefoExpiry > 0) {
    //   const NotificationService = require('../services/notification.service');
    //   await NotificationService.sendDailySummary(summary);
    // }

    return summary;
  } catch (err) {
    logger.error(`[JOB:DAILY] Error inesperado: ${err.message}`, { stack: err.stack });
  }
}

module.exports = { dailySummaryJob };
