/**
 * api/ai.js — Módulo de identificación por IA StockAI
 * Endpoint: POST /ai/identify (multipart/form-data)
 *
 * Flujo:
 *  1. Recibe un File o Blob de imagen
 *  2. Construye FormData (campo: "image")
 *  3. Envía al backend → backend reenvía al microservicio Python
 *  4. Si confidence < 0.85 → requires_human_review: true
 *  5. Si ai-service no responde → service_status: 'unavailable'
 *     En ese caso el frontend debe activar el formulario manual
 */
import client, { ApiError } from './client.js';

const AI = {
  /**
   * Identificar producto por imagen.
   * @param {File|Blob} imageFile — archivo capturado por la cámara o subido
   * @returns {Promise<IdentifyResult>}
   *
   * IdentifyResult:
   *  {
   *    detected:              boolean,
   *    confidence:            number (0-100),
   *    product_name:          string | null,
   *    sku_guess:             string | null,
   *    barcode:               string | null,
   *    expiry_date:           string | null,   // YYYY-MM-DD
   *    lot_number:            string | null,
   *    requires_human_review: boolean,         // true si confidence < 85%
   *    auto_approved:         boolean,
   *    service_status:        'available' | 'unavailable',
   *    fallback_reason:       string | null,
   *  }
   */
  async identify(imageFile) {
    // El camera.js ya normaliza a JPEG via canvas; esta guarda solo filtra no-imágenes
    if (!imageFile.type.startsWith('image/')) {
      throw new ApiError(400, 'INVALID_IMAGE_TYPE', 'Solo se aceptan archivos de imagen.');
    }
    if (imageFile.size > 10 * 1024 * 1024) {
      throw new ApiError(400, 'IMAGE_TOO_LARGE', 'La imagen no puede superar 10 MB.');
    }

    const form = new FormData();
    form.append('image', imageFile, imageFile.name || 'capture.jpg');

    try {
      return await client.postForm('/ai/identify', form);
    } catch (err) {
      // Si el backend retorna 503 (ai-service no disponible), retornar fallback
      if (err instanceof ApiError && err.status === 503) {
        return {
          detected:              false,
          confidence:            0,
          product_name:          null,
          sku_guess:             null,
          barcode:               null,
          expiry_date:           null,
          lot_number:            null,
          requires_human_review: true,
          auto_approved:         false,
          service_status:        'unavailable',
          fallback_reason:       'Motor de IA no disponible. Use ingreso manual.',
        };
      }
      throw err;
    }
  },

  /**
   * Capturar frame desde un elemento <video> (cámara en vivo).
   * @param {HTMLVideoElement} videoEl
   * @returns {Promise<Blob>} imagen JPEG del frame actual
   */
  captureFromVideo(videoEl) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width  = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      canvas.getContext('2d').drawImage(videoEl, 0, 0);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
    });
  },
};

export default AI;
