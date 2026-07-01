'use strict';
const { Op }       = require('sequelize');
const { Batch }    = require('../models');
const AlertService = require('../services/alert.service');
const logger       = require('../config/logger');

/**
 * Job: Revisar lotes que ya activaron su umbral 70/30 o 60/40.
 *
 * Lógica:
 *   1. Buscar lotes ACTIVE cuya fecha_alerta <= hoy
 *   2. Para cada uno, llamar a AlertService.checkAndCreateFEFOAlert()
 *   3. El service verifica que no exista alerta duplicada antes de crear
 *
 * Corre cada hora (configurado en jobs/index.js).
 */
async function expiryCheckerJob() {
  const startedAt = Date.now();
  let processed = 0;
  let created   = 0;

  try {
    const batches = await Batch.findAll({
      where: {
        status:       'ACTIVE',
        fecha_alerta: { [Op.lte]: new Date() },
      },
      include: [{
        association: 'product',
        attributes:  ['id', 'name', 'sku', 'algorithm'],
        where:       { is_active: true },
      }],
      order: [['fecha_alerta', 'ASC']],
    });

    for (const batch of batches) {
      if (!batch.product) continue;  // producto desactivado — saltar
      const before = await _countActiveAlerts(batch.id);
      await AlertService.checkAndCreateFEFOAlert(batch, batch.product);
      const after  = await _countActiveAlerts(batch.id);
      if (after > before) created++;
      processed++;
    }

    const elapsed = Date.now() - startedAt;
    if (processed > 0) {
      logger.info(`[JOB:FEFO] ${processed} lotes revisados, ${created} alertas nuevas. (${elapsed}ms)`);
    } else {
      logger.debug('[JOB:FEFO] Sin lotes con fecha_alerta vencida.');
    }
  } catch (err) {
    logger.error(`[JOB:FEFO] Error inesperado: ${err.message}`, { stack: err.stack });
  }
}

async function _countActiveAlerts(batchId) {
  const { Alert } = require('../models');
  return Alert.count({ where: { batch_id: batchId, type: 'FEFO_EXPIRY', is_resolved: false } });
}

module.exports = { expiryCheckerJob };
