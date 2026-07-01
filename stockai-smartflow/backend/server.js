'use strict';
require('dotenv').config();

const app            = require('./app');
const { sequelize }  = require('./src/models');
const logger         = require('./src/config/logger');
const { startJobs, stockCheckerJob } = require('./src/jobs');

const PORT = process.env.PORT || 3000;

/* ─── Arranque ─────────────────────────────────────────────────────────────── */
async function bootstrap() {
  try {
    // 1. Verificar conexión BD
    await sequelize.authenticate();
    logger.info('[DB] PostgreSQL conectado.');

    // 2. Schema gestionado exclusivamente por migraciones (sequelize-cli db:migrate)
    logger.info('[DB] Schema gestionado por migraciones.');

    // 3. Iniciar cron jobs (FEFO checker, Stock crítico, resumen diario)
    startJobs();
    logger.info('[JOBS] Cron jobs iniciados.');

    // Correr verificación de stock al inicio para poblar alertas inmediatamente
    stockCheckerJob().catch(err => logger.error('[JOBS] Error en verificación inicial de stock:', err));

    // 4. Levantar servidor HTTP
    const server = app.listen(PORT, () =>
      logger.info(`[SERVER] StockAI API corriendo en http://0.0.0.0:${PORT}`)
    );

    // 5. Graceful shutdown
    const shutdown = async (signal) => {
      logger.warn(`[SERVER] ${signal} recibido — apagando...`);
      server.close(async () => {
        await sequelize.close();
        logger.info('[SERVER] Shutdown completo.');
        process.exit(0);
      });
      // Forzar cierre si tarda > 10s
      setTimeout(() => process.exit(1), 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    logger.error('[SERVER] Error fatal en arranque:', err);
    process.exit(1);
  }
}

// Capturar rechazos no manejados
process.on('unhandledRejection', (reason) => {
  logger.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('[UNCAUGHT EXCEPTION]', err);
  process.exit(1);
});

bootstrap();
