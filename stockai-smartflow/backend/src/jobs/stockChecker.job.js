'use strict';
const { Product, StockThreshold } = require('../models');
const AlertService = require('../services/alert.service');
const logger       = require('../config/logger');

/**
 * Job: Verificar stock crítico en TODOS los productos activos.
 *
 * CORRECCIÓN respecto a jobs/index.js original:
 *   El index solo revisaba category:'LACTEOS' — bug que dejaba sin monitorear
 *   aceites, panadería, bebidas, etc. Este job revisa todos.
 *
 * Lógica:
 *   1. Obtener todos los productos activos que tienen umbral configurado
 *   2. Para cada uno llamar AlertService.checkStockCritical()
 *   3. El service calcula el stock real (SUM batches ACTIVE) y crea alerta si aplica
 *
 * Corre 3 veces al día: 08:00, 12:00, 18:00 (configurado en jobs/index.js).
 */
async function stockCheckerJob() {
  const startedAt = Date.now();
  let checked = 0;
  let created = 0;

  try {
    // Solo productos que tienen umbral configurado — sin threshold no hay qué comparar
    const products = await Product.findAll({
      where: { is_active: true },
      include: [{
        association: 'threshold',
        required: true,   // INNER JOIN — excluye productos sin threshold
        attributes: ['critical_stock'],
      }],
      attributes: ['id', 'name', 'sku'],
    });

    for (const product of products) {
      const { Alert } = require('../models');
      const existingCritical = await Alert.count({
        where: { product_id: product.id, type: 'STOCK_CRITICAL', is_resolved: false },
      });
      const existingLow = await Alert.count({
        where: { product_id: product.id, type: 'STOCK_LOW', is_resolved: false },
      });
      const before = existingCritical + existingLow;

      await AlertService.checkStockCritical(product.id);

      const afterCritical = await Alert.count({
        where: { product_id: product.id, type: 'STOCK_CRITICAL', is_resolved: false },
      });
      const afterLow = await Alert.count({
        where: { product_id: product.id, type: 'STOCK_LOW', is_resolved: false },
      });
      if ((afterCritical + afterLow) > before) created++;
      checked++;
    }

    const elapsed = Date.now() - startedAt;
    logger.info(`[JOB:STOCK] ${checked} productos revisados, ${created} alertas nuevas. (${elapsed}ms)`);
  } catch (err) {
    logger.error(`[JOB:STOCK] Error inesperado: ${err.message}`, { stack: err.stack });
  }
}

module.exports = { stockCheckerJob };
