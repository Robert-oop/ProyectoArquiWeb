'use strict';
const axios   = require('axios');
const logger  = require('../config/logger');
const { FEFO } = require('../config/constants');

/**
 * AIService — Proxy al microservicio Python (FastAPI + OpenCV).
 *
 * El controller (ai.controller.js) ya maneja la imagen con multer y la envía
 * directamente vía FormData. Este service provee métodos de apoyo y el
 * fallback de confianza baja.
 *
 * Si el servicio Python no responde → 503 con requires_human_review: true
 * para que el frontend active el formulario manual automáticamente.
 */
class AIService {

  constructor() {
    this.baseUrl   = process.env.AI_SERVICE_URL || 'http://ai-service:9000';
    this.timeout   = parseInt(process.env.AI_TIMEOUT_MS || '15000');
    this.threshold = parseFloat(process.env.CV_CONFIDENCE_THRESHOLD || String(FEFO.AUTO_THRESHOLD));
  }

  /**
   * Envía imagen (Buffer) al microservicio Python y retorna el resultado enriquecido.
   * Usado por ai.controller.js.
   *
   * @param {Buffer} imageBuffer  - Buffer de la imagen (desde multer memoryStorage)
   * @param {string} mimetype     - 'image/jpeg' | 'image/png' | 'image/webp'
   * @param {string} originalname - Nombre original del archivo
   * @returns {Promise<object>}   - Resultado enriquecido con campos de negocio
   */
  async identify(imageBuffer, mimetype, originalname = 'image.jpg') {
    const FormData = require('form-data');
    const form     = new FormData();

    form.append('image', imageBuffer, { filename: originalname, contentType: mimetype });

    try {
      const { data } = await axios.post(`${this.baseUrl}/identify`, form, {
        headers: { ...form.getHeaders() },
        timeout: this.timeout,
      });

      return this._enrich(data);

    } catch (err) {
      // Microservicio no disponible → fallback manual
      if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(err.code)) {
        logger.warn(`[AI] Microservicio no disponible (${err.code}). Activando fallback manual.`);
        return this._fallbackResponse();
      }

      // Error HTTP del microservicio (4xx, 5xx)
      if (err.response) {
        logger.error(`[AI] Error del microservicio: ${err.response.status} — ${JSON.stringify(err.response.data)}`);
        return this._fallbackResponse(`Error del servicio IA: ${err.response.status}`);
      }

      throw err;
    }
  }

  /**
   * Health check del microservicio IA.
   * Usado por el endpoint GET /health del backend.
   */
  async healthCheck() {
    try {
      const { data } = await axios.get(`${this.baseUrl}/health`, { timeout: 3000 });
      return { status: 'ok', ...data };
    } catch {
      return { status: 'unavailable', url: this.baseUrl };
    }
  }

  // ── Privados ────────────────────────────────────────────────────────────────

  /**
   * Enriquece la respuesta cruda del microservicio con campos de negocio.
   */
  _enrich(raw) {
    const confidence = raw.confidence ?? 0;
    return {
      detected:              raw.detected      ?? false,
      confidence:            Math.round(confidence * 100) / 100,
      product_name:          raw.product_name   ?? null,
      sku_guess:             raw.sku_guess       ?? null,
      barcode:               raw.barcode         ?? null,
      expiry_date:           raw.expiry_date     ?? null,
      lot_number:            raw.lot_number      ?? null,
      bounding_box:          raw.bounding_box    ?? null,
      // Campos de negocio calculados aquí
      requires_human_review: confidence < this.threshold,
      auto_approved:         confidence >= this.threshold,
      service_status:        'available',
    };
  }

  /**
   * Respuesta de fallback cuando el microservicio no está disponible.
   * El frontend debe activar el formulario de ingreso manual al ver
   * requires_human_review: true y service_status: 'unavailable'.
   */
  _fallbackResponse(reason = 'Servicio no disponible') {
    return {
      detected:              false,
      confidence:            0,
      product_name:          null,
      sku_guess:             null,
      barcode:               null,
      expiry_date:           null,
      lot_number:            null,
      bounding_box:          null,
      requires_human_review: true,
      auto_approved:         false,
      service_status:        'unavailable',
      fallback_reason:       reason,
    };
  }
}

module.exports = new AIService();
