/**
 * api/alerts.js — Módulo de alertas y stock crítico StockAI
 * Endpoints: GET /alerts | PATCH /alerts/:id/resolve | GET /stock/critical
 */
import client from './client.js';

const Alerts = {
  /**
   * Listar alertas activas.
   * @param {object} params — { type, limit, page, resolved }
   *   type: 'FEFO_EXPIRY' | 'STOCK_CRITICAL' | 'STOCK_LOW' | 'MERMA'
   */
  list({ type, limit = 50, page = 1, resolved = false } = {}) {
    const q = new URLSearchParams({ limit, page, resolved });
    if (type) q.set('type', type);
    return client.get(`/alerts?${q}`);
  },

  /** Obtener detalle de una alerta */
  getById: (id) => client.get(`/alerts/${id}`),

  /**
   * Marcar alerta como resuelta.
   * @param {string} id
   * @param {string} resolutionNote — descripción de la acción tomada
   */
  resolve: (id, resolutionNote = '') =>
    client.patch(`/alerts/${id}/resolve`, { resolution_note: resolutionNote }),

  /** Dispara manualmente el verificador de stock crítico para todos los productos */
  runStockCheck: () => client.post('/alerts/run-stock-check'),

  // ── Stock crítico ──────────────────────────────────────────────────────────

  /**
   * Productos bajo su umbral Stock_Crítico.
   * @param {object} params — { severity: 'CRITICAL' | 'LOW', category }
   */
  getCriticalStock({ severity, category } = {}) {
    const q = new URLSearchParams();
    if (severity) q.set('severity', severity);
    if (category) q.set('category', category);
    const qs = q.toString();
    return client.get(`/stock/critical${qs ? `?${qs}` : ''}`);
  },
};

export default Alerts;
