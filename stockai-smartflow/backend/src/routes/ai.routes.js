'use strict';
const router = require('express').Router();
const { authenticate }  = require('../middleware/auth.middleware');
const aiController      = require('../controllers/ai.controller');

/**
 * CORRECCIÓN: el archivo original tenía GET / y GET /:id que son rutas de alertas,
 * no del módulo IA. El único endpoint IA es POST /identify.
 *
 * POST /api/v1/ai/identify
 *   - Recibe imagen multipart/form-data (campo: "image")
 *   - Envía al microservicio Python (ai-service:9000)
 *   - Retorna resultado con confidence, product_name, expiry_date, etc.
 *   - Si confidence < 0.85 → requires_human_review: true
 *   - Si ai-service no responde → service_status: 'unavailable' (fallback manual)
 */
router.post(
  '/identify',
  authenticate,
  aiController.uploadMiddleware,   // multer: procesa multipart → req.file
  aiController.identify
);

module.exports = router;
