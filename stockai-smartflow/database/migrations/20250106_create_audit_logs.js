'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type:         Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey:   true,
        allowNull:    false,
      },
      // Sin FK a users intencionalmente:
      // Si se elimina un usuario, el historial de acciones debe preservarse.
      user_id: {
        type:      Sequelize.UUID,
        allowNull: false,
        comment:   'Sin FK — preservar log aunque el usuario sea eliminado',
      },
      action: {
        type:      Sequelize.STRING(100),
        allowNull: false,
        comment:   'Ej: BATCH_CREATED, PRODUCT_UPDATED, BATCH_CONSUMED, LOGIN',
      },
      entity: {
        type:      Sequelize.STRING(50),
        allowNull: false,
        comment:   'Ej: Batch, Product, Alert, User',
      },
      entity_id: {
        type:      Sequelize.UUID,
        allowNull: true,
      },
      old_value: {
        type:      Sequelize.JSONB,
        allowNull: true,
        comment:   'Estado anterior del recurso modificado',
      },
      new_value: {
        type:      Sequelize.JSONB,
        allowNull: true,
        comment:   'Estado nuevo del recurso modificado',
      },
      ip_address: {
        type:      Sequelize.INET,
        allowNull: true,
      },
      request_id: {
        type:      Sequelize.STRING(50),
        allowNull: true,
        comment:   'X-Request-ID de la petición HTTP — para correlacionar logs',
      },
      // Solo created_at — tabla append-only, sin updated_at ni deleted_at
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('audit_logs', ['user_id']);
    await queryInterface.addIndex('audit_logs', ['entity', 'entity_id']);
    await queryInterface.addIndex('audit_logs', ['action']);
    await queryInterface.addIndex('audit_logs', ['created_at']);

    // Trigger PostgreSQL: bloquear UPDATE y DELETE (tabla inmutable)
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_modification()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'La tabla audit_logs es inmutable. No se permiten UPDATE ni DELETE.';
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryInterface.sequelize.query(`
      CREATE TRIGGER audit_logs_immutable
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;');
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS prevent_audit_modification();');
    await queryInterface.dropTable('audit_logs');
  },
};
