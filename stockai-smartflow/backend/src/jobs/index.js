'use strict';
const cron   = require('node-cron');
const logger = require('../config/logger');

// Importar cada job como módulo independiente (testeables por separado)
const { expiryCheckerJob } = require('./expiryChecker.job');
const { stockCheckerJob }  = require('./stockChecker.job');
const { dailySummaryJob }  = require('./dailySummary.job');

/**
 * Registra y arranca todos los cron jobs del sistema.
 * Se llama desde server.js después de que la BD esté conectada.
 */
function startJobs() {
  // ── Job 1: Revisar lotes con fecha_alerta vencida (70/30 o 60/40) ──────────
  // Cada hora en punto
  cron.schedule('0 * * * *', expiryCheckerJob, {
    name:     'fefo-checker',
    timezone: 'America/Santiago',
  });

  // ── Job 2: Verificar stock crítico en TODOS los productos activos ────────────
  // CORRECCIÓN: antes solo revisaba LACTEOS — ahora revisa todos
  // 3 veces al día: 08:00, 12:00, 18:00
  cron.schedule('0 8,12,18 * * *', stockCheckerJob, {
    name:     'stock-checker',
    timezone: 'America/Santiago',
  });

  // ── Job 3: Resumen diario del estado de bodega ───────────────────────────────
  // Todos los días a las 07:00
  cron.schedule('0 7 * * *', dailySummaryJob, {
    name:     'daily-summary',
    timezone: 'America/Santiago',
  });

  logger.info('[JOBS] 3 cron jobs registrados: fefo-checker, stock-checker, daily-summary.');
}

// Exportar también las funciones para poder correrlas manualmente o en tests
module.exports = {
  startJobs,
  expiryCheckerJob,
  stockCheckerJob,
  dailySummaryJob,
};
