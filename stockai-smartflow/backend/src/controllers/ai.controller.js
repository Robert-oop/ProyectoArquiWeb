'use strict';
const multer = require('multer');
const axios  = require('axios');
const FormData = require('form-data');
const { FEFO } = require('../config/constants');
const { Errors } = require('../middleware/error.middleware');

// Multer: memoria (no disco) — imágenes hasta 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    /image\/(jpeg|png|webp)/.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Solo se aceptan imágenes JPEG, PNG o WebP.')),
});

// Middleware de upload exportado para usarlo en la ruta
exports.uploadMiddleware = upload.single('image');

exports.identify = async (req, res, next) => {
  try {
    if (!req.file) throw Errors.validation([{ field: 'image', message: 'Imagen requerida.' }]);

    const CV_URL = process.env.AI_SERVICE_URL || 'http://ai-service:9000';

    // Reenviar imagen al microservicio Python (ai-service)
    const form = new FormData();
    form.append('image', req.file.buffer, {
      filename:    req.file.originalname,
      contentType: req.file.mimetype,
    });

    const { data } = await axios.post(`${CV_URL}/identify`, form, {
      headers: form.getHeaders(),
      timeout: 15_000,  // 15s max (OpenCV puede tardar en imágenes complejas)
    });

    // Enriquecer respuesta con campos de negocio
    const response = {
      detected:            data.detected,
      confidence:          data.confidence,
      product_name:        data.product_name   || null,
      sku_guess:           data.sku_guess       || null,
      expiry_date:         data.expiry_date     || null,
      lot_number:          data.lot_number      || null,
      bounding_box:        data.bounding_box    || null,
      requires_human_review: data.confidence < FEFO.AUTO_THRESHOLD,
      // Umbral de negocio: ≥ 85% → automatizar sin intervención humana
      auto_approved:       data.confidence >= FEFO.AUTO_THRESHOLD,
    };

    res.json(response);
  } catch (e) {
    // Cualquier error de red/conexión con ai-service → 503
    const NET_CODES = ['ECONNREFUSED', 'ENOTFOUND', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH'];
    const isNetError = NET_CODES.includes(e.code) || e.response?.status === 503;
    if (isNetError) {
      return next(new (require('../middleware/error.middleware').AppError)(
        503, 'AI_SERVICE_UNAVAILABLE',
        'El motor de visión artificial no está disponible. Use ingreso manual.'
      ));
    }
    next(e);
  }
};