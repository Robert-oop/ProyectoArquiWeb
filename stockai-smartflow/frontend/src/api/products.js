/**
 * api/products.js — Módulo de productos StockAI
 * Endpoints: GET/POST/PUT/PATCH/DELETE /products + /threshold
 */
import client from './client.js';

const Products = {
  /**
   * Listar productos con filtros opcionales.
   * @param {object} filters — { page, limit, search, category, status, location,
   *                             expiring, algorithm, sort, order }
   */
  list(filters = {}) {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, v); });
    const qs = q.toString();
    return client.get(`/products${qs ? `?${qs}` : ''}`);
  },

  /** Obtener un producto por ID */
  getById: (id) => client.get(`/products/${id}`),

  /**
   * Crear producto.
   * @param {object} data — campos del producto + critical_stock opcional
   */
  create: (data) => client.post('/products', data),

  /**
   * Actualizar producto completo (PUT).
   * @param {string} id
   * @param {object} data
   */
  update: (id, data) => client.put(`/products/${id}`, data),

  /**
   * Actualizar solo el precio de venta (PATCH).
   * @param {string} id
   * @param {number} priceSale
   */
  updatePrice: (id, priceSale) => client.patch(`/products/${id}/price`, { price_sale: priceSale }),

  /**
   * Soft delete (desactiva el producto).
   */
  delete: (id) => client.delete(`/products/${id}`),

  // ── Lotes ─────────────────────────────────────────────────────────────────

  /** Generar un SKU único disponible */
  generateSku: () => client.get('/products/generate-sku'),

  /** Lotes de un producto ordenados por FEFO (fecha_alerta ASC) */
  getBatches: (productId, status = 'ACTIVE') =>
    client.get(`/products/${productId}/batches${status ? `?status=${status}` : ''}`),

  /** Registrar nuevo lote */
  createBatch: (productId, data) => client.post(`/products/${productId}/batches`, data),

  // ── Stock threshold ────────────────────────────────────────────────────────

  /** Obtener umbral Stock_Crítico de un producto */
  getThreshold: (id) => client.get(`/products/${id}/threshold`),

  /**
   * Actualizar umbral Stock_Crítico.
   * @param {string} id
   * @param {number} criticalStock
   * @param {number|null} minOrderQty
   * @param {string} reason — se guarda en AuditLog
   */
  updateThreshold: (id, criticalStock, minOrderQty = null, reason = '') =>
    client.put(`/products/${id}/threshold`, {
      critical_stock: criticalStock,
      min_order_qty:  minOrderQty,
      reason,
    }),
};

export default Products;
