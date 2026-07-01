'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const products = [
      // ── LÁCTEOS ──────────────────────────────────────────────────────────────
      {
        id: 'aaa00000-0000-0000-0000-000000000001',
        sku: 'SKU-001122', barcode: '7800123456781', name: 'Yogur Griego 500g',
        category: 'LACTEOS', price_cost: 1800, price_sale: 2450,
        unit: 'UNIT', location: 'A3-B2',
        vida_util_promedio_dias: 28, algorithm: '70_30',
        is_active: true, created_at: now, updated_at: now,
      },
      {
        id: 'aaa00000-0000-0000-0000-000000000002',
        sku: 'SKU-000891', barcode: '7800123456782', name: 'Leche Entera 1L',
        category: 'LACTEOS', price_cost: 650, price_sale: 980,
        unit: 'UNIT', location: 'B1-C1',
        vida_util_promedio_dias: 12, algorithm: '60_40',
        is_active: true, created_at: now, updated_at: now,
      },
      {
        id: 'aaa00000-0000-0000-0000-000000000003',
        sku: 'SKU-002210', barcode: '7800123456783', name: 'Queso Gouda 200g',
        category: 'LACTEOS', price_cost: 2100, price_sale: 3200,
        unit: 'UNIT', location: 'A2-B3',
        vida_util_promedio_dias: 45, algorithm: '60_40',
        is_active: true, created_at: now, updated_at: now,
      },
      {
        id: 'aaa00000-0000-0000-0000-000000000004',
        sku: 'SKU-004401', barcode: '7800123456784', name: 'Crema Ácida 200g',
        category: 'LACTEOS', price_cost: 1100, price_sale: 1850,
        unit: 'UNIT', location: 'C1-A3',
        vida_util_promedio_dias: 21, algorithm: '70_30',
        is_active: true, created_at: now, updated_at: now,
      },
      {
        id: 'aaa00000-0000-0000-0000-000000000005',
        sku: 'SKU-004402', barcode: '7800123456785', name: 'Mantequilla 250g',
        category: 'LACTEOS', price_cost: 1400, price_sale: 2200,
        unit: 'UNIT', location: 'C2-A1',
        vida_util_promedio_dias: 60, algorithm: '70_30',
        is_active: true, created_at: now, updated_at: now,
      },
      // ── ACEITES ───────────────────────────────────────────────────────────────
      {
        id: 'aaa00000-0000-0000-0000-000000000006',
        sku: 'SKU-003301', barcode: '7800123456786', name: 'Aceite Oliva 1L',
        category: 'ACEITES', price_cost: 3800, price_sale: 5990,
        unit: 'UNIT', location: 'D2-A1',
        vida_util_promedio_dias: 730, algorithm: '70_30',
        is_active: true, created_at: now, updated_at: now,
      },
      // ── PANADERÍA ─────────────────────────────────────────────────────────────
      {
        id: 'aaa00000-0000-0000-0000-000000000007',
        sku: 'SKU-005512', barcode: '7800123456787', name: 'Harina Integral 1kg',
        category: 'PANADERIA', price_cost: 780, price_sale: 1190,
        unit: 'KG', location: 'C3-A2',
        vida_util_promedio_dias: 180, algorithm: '70_30',
        is_active: true, created_at: now, updated_at: now,
      },
      // ── BEBIDAS ───────────────────────────────────────────────────────────────
      {
        id: 'aaa00000-0000-0000-0000-000000000008',
        sku: 'SKU-006601', barcode: '7800123456788', name: 'Jugo Naranja 1L',
        category: 'BEBIDAS', price_cost: 880, price_sale: 1490,
        unit: 'UNIT', location: 'B3-C2',
        vida_util_promedio_dias: 90, algorithm: '60_40',
        is_active: true, created_at: now, updated_at: now,
      },
      // ── CONGELADOS ────────────────────────────────────────────────────────────
      {
        id: 'aaa00000-0000-0000-0000-000000000009',
        sku: 'SKU-007701', barcode: '7800123456789', name: 'Empanadas Pollo x6',
        category: 'CONGELADOS', price_cost: 1900, price_sale: 2990,
        unit: 'BOX', location: 'E1-A1',
        vida_util_promedio_dias: 180, algorithm: '70_30',
        is_active: true, created_at: now, updated_at: now,
      },
      // ── SNACKS ────────────────────────────────────────────────────────────────
      {
        id: 'aaa00000-0000-0000-0000-000000000010',
        sku: 'SKU-008801', barcode: '7800123456790', name: 'Papas Fritas 150g',
        category: 'SNACKS', price_cost: 490, price_sale: 890,
        unit: 'UNIT', location: 'F1-B1',
        vida_util_promedio_dias: 120, algorithm: '70_30',
        is_active: true, created_at: now, updated_at: now,
      },
      // ── LIMPIEZA ──────────────────────────────────────────────────────────────
      {
        id: 'aaa00000-0000-0000-0000-000000000011',
        sku: 'SKU-009901', barcode: '7800123456791', name: 'Detergente 1L',
        category: 'LIMPIEZA', price_cost: 1200, price_sale: 1990,
        unit: 'UNIT', location: 'G1-A1',
        vida_util_promedio_dias: 1095, algorithm: '70_30',   // 3 años
        is_active: true, created_at: now, updated_at: now,
      },
      // ── Producto CRÍTICO (stock bajo) — para probar alertas ────────────────
      {
        id: 'aaa00000-0000-0000-0000-000000000012',
        sku: 'SKU-010001', barcode: '7800123456792', name: 'Azúcar Morena 1kg',
        category: 'PANADERIA', price_cost: 580, price_sale: 890,
        unit: 'KG', location: 'C3-B1',
        vida_util_promedio_dias: 730, algorithm: '70_30',
        is_active: true, created_at: now, updated_at: now,
      },
    ];

    await queryInterface.bulkInsert('products', products);

    // Stock thresholds para cada producto
    const thresholds = products.map((p, i) => ({
      id:             `bbb00000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
      product_id:     p.id,
      critical_stock: [20, 48, 30, 24, 20, 24, 20, 24, 12, 24, 12, 15][i],
      min_order_qty:  [50, 96, 48, 48, 30, 50, 30, 48, 24, 48, 24, 25][i],
      created_at:     now,
      updated_at:     now,
    }));

    await queryInterface.bulkInsert('stock_thresholds', thresholds);
  },

  async down(queryInterface) {
    const ids = Array.from({ length: 12 }, (_, i) =>
      `aaa00000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`
    );
    await queryInterface.bulkDelete('stock_thresholds', { product_id: ids });
    await queryInterface.bulkDelete('products', { id: ids });
  },
};
