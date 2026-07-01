'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now   = new Date();

    // Helper: fecha relativa a hoy
    const daysFrom = (n) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return d.toISOString().split('T')[0];
    };
    const daysAgo = (n) => daysFrom(-n);

    // Helper: calcular fecha_alerta = hoy_ingreso + (vida_util × factor)
    const calcAlerta = (vidaUtil, factor, ingresoDate) => {
      const d = new Date(ingresoDate || now);
      d.setDate(d.getDate() + Math.floor(vidaUtil * factor));
      return d.toISOString().split('T')[0];
    };

    const MANAGER = '00000000-0000-0000-0000-000000000002';

    const batches = [
      // ── Yogur Griego (vida_util=28d, 70/30) ─────────────────────────────────
      // P1: ya activó alerta (ingresó hace 25 días, alerta a los 19.6d = hace 5d)
      {
        id: 'ccc00000-0000-0000-0000-000000000001',
        product_id: 'aaa00000-0000-0000-0000-000000000001',
        lot_number: 'L2024-118', quantity: 48,
        manufacture_date: daysAgo(32), expiry_date: daysFrom(8),
        fecha_alerta: daysAgo(5),   // ← ya activó 70/30
        algorithm: '70_30', location_bodega: 'A3-B2',
        status: 'ACTIVE', registered_by: MANAGER,
        notes: 'Ingreso via IA — confianza 97%',
        created_at: new Date(Date.now() - 25 * 86400000), updated_at: now,
      },
      // P2: activará alerta en 3 días
      {
        id: 'ccc00000-0000-0000-0000-000000000002',
        product_id: 'aaa00000-0000-0000-0000-000000000001',
        lot_number: 'L2024-220', quantity: 96,
        manufacture_date: daysAgo(15), expiry_date: daysFrom(21),
        fecha_alerta: daysFrom(3),
        algorithm: '70_30', location_bodega: 'A3-B2',
        status: 'ACTIVE', registered_by: MANAGER, notes: null,
        created_at: new Date(Date.now() - 15 * 86400000), updated_at: now,
      },

      // ── Leche Entera (vida_util=12d, 60/40) ─────────────────────────────────
      // P1: activó 60/40 (ingresó hace 8d, alerta a los 7.2d = hace ~1d)
      {
        id: 'ccc00000-0000-0000-0000-000000000003',
        product_id: 'aaa00000-0000-0000-0000-000000000002',
        lot_number: 'L2024-201', quantity: 120,
        manufacture_date: daysAgo(10), expiry_date: daysFrom(12),
        fecha_alerta: daysAgo(1),   // ← ya activó 60/40
        algorithm: '60_40', location_bodega: 'B1-C1',
        status: 'ACTIVE', registered_by: MANAGER, notes: null,
        created_at: new Date(Date.now() - 8 * 86400000), updated_at: now,
      },
      // P2: fresca, vence en 20 días
      {
        id: 'ccc00000-0000-0000-0000-000000000004',
        product_id: 'aaa00000-0000-0000-0000-000000000002',
        lot_number: 'L2024-310', quantity: 240,
        manufacture_date: daysAgo(2), expiry_date: daysFrom(20),
        fecha_alerta: daysFrom(5),
        algorithm: '60_40', location_bodega: 'B1-C1',
        status: 'ACTIVE', registered_by: MANAGER, notes: null,
        created_at: new Date(Date.now() - 2 * 86400000), updated_at: now,
      },

      // ── Aceite de Oliva (vida_util=730d) — STOCK CRÍTICO: solo 2 unidades ───
      {
        id: 'ccc00000-0000-0000-0000-000000000005',
        product_id: 'aaa00000-0000-0000-0000-000000000006',
        lot_number: 'L2023-401', quantity: 2,   // ← bajo stock crítico (24)
        manufacture_date: daysAgo(180), expiry_date: daysFrom(550),
        fecha_alerta: calcAlerta(730, 0.70, daysAgo(180)),
        algorithm: '70_30', location_bodega: 'D2-A1',
        status: 'ACTIVE', registered_by: MANAGER, notes: null,
        created_at: new Date(Date.now() - 180 * 86400000), updated_at: now,
      },

      // ── Harina Integral — STOCK BAJO: 8 unidades (crítico=20) ───────────────
      {
        id: 'ccc00000-0000-0000-0000-000000000006',
        product_id: 'aaa00000-0000-0000-0000-000000000007',
        lot_number: 'L2024-500', quantity: 8,   // ← bajo stock crítico (20)
        manufacture_date: daysAgo(60), expiry_date: daysFrom(120),
        fecha_alerta: calcAlerta(180, 0.70, daysAgo(60)),
        algorithm: '70_30', location_bodega: 'C3-A2',
        status: 'ACTIVE', registered_by: MANAGER, notes: null,
        created_at: new Date(Date.now() - 60 * 86400000), updated_at: now,
      },

      // ── Queso Gouda — lotes saludables para mostrar FEFO normal ─────────────
      {
        id: 'ccc00000-0000-0000-0000-000000000007',
        product_id: 'aaa00000-0000-0000-0000-000000000003',
        lot_number: 'L2024-601', quantity: 72,
        manufacture_date: daysAgo(10), expiry_date: daysFrom(35),
        fecha_alerta: daysFrom(17),   // 60/40: alerta cuando quede 40% de 45d
        algorithm: '60_40', location_bodega: 'A2-B3',
        status: 'ACTIVE', registered_by: MANAGER, notes: null,
        created_at: new Date(Date.now() - 10 * 86400000), updated_at: now,
      },

      // ── Mantequilla — lote P1 con alerta próxima ─────────────────────────────
      {
        id: 'ccc00000-0000-0000-0000-000000000008',
        product_id: 'aaa00000-0000-0000-0000-000000000005',
        lot_number: 'L2024-155', quantity: 60,
        manufacture_date: daysAgo(45), expiry_date: daysFrom(22),
        fecha_alerta: daysAgo(3),   // ← ya activó 70/30
        algorithm: '70_30', location_bodega: 'C2-A1',
        status: 'ACTIVE', registered_by: MANAGER, notes: null,
        created_at: new Date(Date.now() - 45 * 86400000), updated_at: now,
      },

      // ── Jugo Naranja — fresco, sin alertas ───────────────────────────────────
      {
        id: 'ccc00000-0000-0000-0000-000000000009',
        product_id: 'aaa00000-0000-0000-0000-000000000008',
        lot_number: 'L2024-701', quantity: 48,
        manufacture_date: daysAgo(5), expiry_date: daysFrom(85),
        fecha_alerta: calcAlerta(90, 0.60, daysAgo(5)),
        algorithm: '60_40', location_bodega: 'B3-C2',
        status: 'ACTIVE', registered_by: MANAGER, notes: null,
        created_at: new Date(Date.now() - 5 * 86400000), updated_at: now,
      },

      // ── Azúcar Morena — STOCK CRÍTICO: 5 unidades (crítico=15) ──────────────
      {
        id: 'ccc00000-0000-0000-0000-000000000010',
        product_id: 'aaa00000-0000-0000-0000-000000000012',
        lot_number: 'L2024-801', quantity: 5,   // ← bajo stock crítico (15)
        manufacture_date: daysAgo(90), expiry_date: daysFrom(640),
        fecha_alerta: calcAlerta(730, 0.70, daysAgo(90)),
        algorithm: '70_30', location_bodega: 'C3-B1',
        status: 'ACTIVE', registered_by: MANAGER, notes: null,
        created_at: new Date(Date.now() - 90 * 86400000), updated_at: now,
      },
    ];

    await queryInterface.bulkInsert('batches', batches);
  },

  async down(queryInterface) {
    const ids = Array.from({ length: 10 }, (_, i) =>
      `ccc00000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`
    );
    await queryInterface.bulkDelete('batches', { id: ids });
  },
};
