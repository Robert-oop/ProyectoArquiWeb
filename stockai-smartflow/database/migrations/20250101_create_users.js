'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type:         Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey:   true,
        allowNull:    false,
      },
      name: {
        type:      Sequelize.STRING(100),
        allowNull: false,
      },
      email: {
        type:      Sequelize.STRING(150),
        allowNull: false,
        unique:    true,
      },
      password_hash: {
        type:      Sequelize.TEXT,
        allowNull: false,
      },
      role: {
        type:         Sequelize.ENUM('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_OPERATOR'),
        defaultValue: 'ROLE_OPERATOR',
        allowNull:    false,
      },
      mfa_secret: {
        type:      Sequelize.STRING(64),
        allowNull: true,
      },
      mfa_enabled: {
        type:         Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull:    false,
      },
      is_active: {
        type:         Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull:    false,
      },
      last_login: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type:      Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type:      Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      deleted_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex('users', ['email'],       { unique: true });
    await queryInterface.addIndex('users', ['role']);
    await queryInterface.addIndex('users', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
    // Eliminar el ENUM manualmente en Postgres
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
  },
};
