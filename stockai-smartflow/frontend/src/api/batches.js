/**
 * api/batches.js — Módulo de lotes (FEFO) StockAI
 * Endpoints: GET /batches/expiring | PATCH /batches/:id/consume | DELETE /batches/:id
 */
import client from './client.js';

const Batches = {
  /**
   * Lotes que ya activaron el algoritmo 70/30 o 60/40.
   * Ordenados por urgencia (fecha_alerta ASC → P1 primero).
   * @param {object} params — { days, limit, productId }
   */
  getExpiring({ days = 30, limit = 50, productId } = {}) {
    const q = new URLSearchParams({ days, limit });
    if (productId) q.set('product_id', productId);
    return client.get(`/batches/expiring?${q}`);
  },

  /**
   * Consumir unidades de un lote (repositor despacha a góndola).
   * @param {string} batchId
   * @param {number} quantity — unidades retiradas
   * @param {string} notes   — observación opcional
   */
  consume: (batchId, quantity, notes = '') =>
    client.patch(`/batches/${batchId}/consume`, { quantity, notes }),

  /**
   * Baja por merma (void) — requiere motivo.
   * @param {string} batchId
   * @param {string} reason
   * @param {number|null} affectedQty — null = baja total del lote
   */
  void: (batchId, reason, affectedQty = null) =>
    client.delete(`/batches/${batchId}`, {
      body: JSON.stringify({ reason, affected_qty: affectedQty }),
      headers: { 'Content-Type': 'application/json' },
    }),
};

export default Batches;
