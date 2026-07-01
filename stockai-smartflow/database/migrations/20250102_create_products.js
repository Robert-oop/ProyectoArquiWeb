'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('products', {
      id: {
        type:         Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey:   true,
        allowNull:    false,
      },
      sku: {
        type:      Sequelize.STRING(50),
        allowNull: false,
        unique:    true,
      },
      barcode: {
        type:      Sequelize.STRING(30),
        allowNull: true,
        unique:    true,
      },
      name: {
        type:      Sequelize.STRING(200),
        allowNull: false,
      },
      category: {
        type: Sequelize.ENUM(
          'LACTEOS', 'BEBIDAS', 'PANADERIA',
          'CONGELADOS', 'ACEITES', 'SNACKS', 'LIMPIEZA'
        ),
        allowNull:    false,
        defaultValue: 'LACTEOS',
      },
      price_cost: {
        type:      Sequelize.INTEGER,   // CLP — sin decimales
        allowNull: false,
      },
      price_sale: {
        type:      Sequelize.INTEGER,
        allowNull: false,
      },
      unit: {
        type:         Sequelize.ENUM('UNIT', 'BOX', 'KG', 'LITER'),
        defaultValue: 'UNIT',
        allowNull:    false,
      },
      location: {
        type:      Sequelize.STRING(20),
        allowNull: false,
        comment:   'Formato: A3-B2 (Pasillo-Estante)',
      },
      // Días de vida útil promedio del producto.
      // Base para calcular fecha_alerta en los lotes (70/30 o 60/40).
      vida_util_promedio_dias: {
        type:      Sequelize.INTEGER,
        allowNull: false,
        comment:   'Días que suele durar el producto — base para cálculo fecha_alerta',
      },
      algorithm: {
        type:         Sequelize.ENUM('70_30', '60_40'),
        defaultValue: '70_30',
        allowNull:    false,
        comment:      'Algoritmo FEFO asignado al producto',
      },
      imagen_ref_url: {
        type:      Sequelize.TEXT,
        allowNull: true,
        comment:   'URL de imagen de referencia para el motor IA',
      },
      notes: {
        type:      Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        type:         Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull:    false,
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

    await queryInterface.addIndex('products', ['sku'],       { unique: true });
    await queryInterface.addIndex('products', ['barcode'],   { unique: true, where: { barcode: { [Symbol.for('ne')]: null } } });
    await queryInterface.addIndex('products', ['category']);
    await queryInterface.addIndex('products', ['location']);
    await queryInterface.addIndex('products', ['is_active']);
    await queryInterface.addIndex('products', ['algorithm']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('products');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_products_category";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_products_unit";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_products_algorithm";');
  },
};
