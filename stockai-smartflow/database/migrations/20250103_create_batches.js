'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('batches', {
      id: {
        type:         Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey:   true,
        allowNull:    false,
      },
      product_id: {
        type:       Sequelize.UUID,
        allowNull:  false,
        references: { model: 'products', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'RESTRICT',   // no borrar product si tiene lotes
      },
      lot_number: {
        type:      Sequelize.STRING(50),
        allowNull: false,
        comment:   'Código del lote del fabricante. Ej: L2024-118',
      },
      quantity: {
        type:         Sequelize.INTEGER,
        allowNull:    false,
        defaultValue: 0,
      },
      manufacture_date: {
        type:      Sequelize.DATEONLY,
        allowNull: true,
      },
      expiry_date: {
        type:      Sequelize.DATEONLY,
        allowNull: false,
      },
      // Fecha calculada: fecha_ingreso + (vida_util_dias × factor_algoritmo)
      // Es el campo clave para FEFO: ORDER BY fecha_alerta ASC
      fecha_alerta: {
        type:      Sequelize.DATEONLY,
        allowNull: true,
        comment:   'Fecha desde la que se prioriza el despacho (regla 70/30 o 60/40)',
      },
      algorithm: {
        type:         Sequelize.ENUM('70_30', '60_40'),
        defaultValue: '70_30',
        allowNull:    false,
        comment:      'Hereda el algoritmo del producto al momento del ingreso',
      },
      location_bodega: {
        type:      Sequelize.STRING(20),
        allowNull: true,
        comment:   'Ubicación física en bodega — puede diferir de la del producto',
      },
      status: {
        type:         Sequelize.ENUM('ACTIVE', 'CONSUMED', 'EXPIRED', 'VOID', 'MERMA'),
        defaultValue: 'ACTIVE',
        allowNull:    false,
      },
      registered_by: {
        type:       Sequelize.UUID,
        allowNull:  true,
        references: { model: 'users', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'SET NULL',
      },
      notes: {
        type:      Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.NOW,
      },
      deleted_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
    });

    // Índice compuesto único: un número de lote no puede repetirse en el mismo producto
    await queryInterface.addIndex('batches', ['product_id', 'lot_number'], { unique: true });
    // Índice FEFO — la query más importante del sistema
    await queryInterface.addIndex('batches', ['product_id', 'fecha_alerta', 'status']);
    await queryInterface.addIndex('batches', ['fecha_alerta']);
    await queryInterface.addIndex('batches', ['expiry_date']);
    await queryInterface.addIndex('batches', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('batches');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_batches_algorithm";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_batches_status";');
  },
};
