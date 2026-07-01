'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('alerts', {
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
        onDelete:   'CASCADE',
      },
      // batch_id es null para alertas de stock crítico
      batch_id: {
        type:       Sequelize.UUID,
        allowNull:  true,
        references: { model: 'batches', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'SET NULL',
        comment:    'Lote que disparó la alerta (null si es alerta de stock)',
      },
      // Tipos según alert.service.js existente
      type: {
        type: Sequelize.ENUM('FEFO_EXPIRY', 'STOCK_CRITICAL', 'STOCK_LOW', 'MERMA'),
        allowNull: false,
      },
      message: {
        type:      Sequelize.TEXT,
        allowNull: false,
      },
      is_resolved: {
        type:         Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull:    false,
      },
      resolved_by: {
        type:       Sequelize.UUID,
        allowNull:  true,
        references: { model: 'users', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'SET NULL',
      },
      resolved_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      resolution_note: {
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

    // Índices para queries frecuentes en alert.service.js
    await queryInterface.addIndex('alerts', ['product_id']);
    await queryInterface.addIndex('alerts', ['batch_id']);
    await queryInterface.addIndex('alerts', ['is_resolved']);
    await queryInterface.addIndex('alerts', ['type']);
    // Índice compuesto: buscar alerta activa de un tipo para un producto (anti-duplicado)
    await queryInterface.addIndex('alerts', ['product_id', 'type', 'is_resolved']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('alerts');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_alerts_type";');
  },
};
