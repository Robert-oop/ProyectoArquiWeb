'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stock_thresholds', {
      id: {
        type:         Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey:   true,
        allowNull:    false,
      },
      product_id: {
        type:       Sequelize.UUID,
        allowNull:  false,
        unique:     true,           // 1 umbral por producto
        references: { model: 'products', key: 'id' },
        onUpdate:   'CASCADE',
        onDelete:   'CASCADE',      // si se elimina el producto, se elimina su umbral
      },
      // Cantidad mínima antes de generar alerta STOCK_CRITICAL
      critical_stock: {
        type:         Sequelize.INTEGER,
        allowNull:    false,
        defaultValue: 0,
        comment:      'Alerta si stock_actual <= critical_stock',
      },
      // Cantidad sugerida al hacer orden de compra (mejora #3 del master prompt)
      min_order_qty: {
        type:      Sequelize.INTEGER,
        allowNull: true,
        comment:   'Cantidad mínima sugerida al ordenar. Si null → se calcula: deficit × 2',
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
      // No paranoid para esta tabla: si se borra, se borra de verdad
    });

    await queryInterface.addIndex('stock_thresholds', ['product_id'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('stock_thresholds');
  },
};
