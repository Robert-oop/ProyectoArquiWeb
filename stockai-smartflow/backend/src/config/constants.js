'use strict';
// ═══════════════════════════════════════════════════════════════
// Reglas de negocio StockAI — NO hardcodear en otra parte
// ═══════════════════════════════════════════════════════════════

module.exports = Object.freeze({

  // ── Algoritmos de Vencimiento ─────────────────────────────────
  // fecha_alerta = fecha_ingreso + (vida_util_dias × FACTOR)
  FEFO: {
    ALGORITHM_70_30:  0.70,  // Alerta cuando queda 30% de vida útil
    ALGORITHM_60_40:  0.60,  // Variante para lácteos de alta rotación
    AUTO_THRESHOLD:   0.85,  // Confianza mínima para automatización IA (85%)
  },

  // ── Roles RBAC ────────────────────────────────────────────────
  ROLES: {
    ADMIN:    'ROLE_ADMIN',
    MANAGER:  'ROLE_MANAGER',
    OPERATOR: 'ROLE_OPERATOR',
  },

  // ── Estados de Lote ──────────────────────────────────────────
  BATCH_STATUS: {
    ACTIVE:   'ACTIVE',
    CONSUMED: 'CONSUMED',
    EXPIRED:  'EXPIRED',
    VOID:     'VOID',      // anulado por error de ingreso
    MERMA:    'MERMA',     // dado de baja por daño/vencimiento físico
  },

  // ── Estados de Producto ──────────────────────────────────────
  STOCK_STATUS: {
    NORMAL:   'NORMAL',
    LOW:      'LOW',
    CRITICAL: 'CRITICAL',
  },

  // ── Prioridades FEFO ─────────────────────────────────────────
  FEFO_PRIORITY: {
    P1: 'P1',  // Vence primero — despachar YA
    P2: 'P2',
    P3: 'P3',
  },

  // ── Tipos de Movimiento (Audit) ──────────────────────────────
  MOVEMENT_TYPES: {
    INGRESO_ALMACEN:    'INGRESO_ALMACEN',
    TRASLADO_REPOSICION:'TRASLADO_REPOSICION',
    BAJA_MERMA:         'BAJA_MERMA',
    AJUSTE_INVENTARIO:  'AJUSTE_INVENTARIO',
  },

  // ── Categorías de Producto ───────────────────────────────────
  CATEGORIES: ['LACTEOS', 'BEBIDAS', 'PANADERIA', 'CONGELADOS', 'ACEITES', 'SNACKS', 'LIMPIEZA'],

  // ── JWT ──────────────────────────────────────────────────────
  JWT: {
    ACCESS_EXPIRE:  '15m',
    REFRESH_EXPIRE: '7d',
  },

  // ── Paginación ───────────────────────────────────────────────
  PAGINATION: {
    DEFAULT_LIMIT: 25,
    MAX_LIMIT:     100,
  },
});
