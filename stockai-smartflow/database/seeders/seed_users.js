'use strict';

// Hashes pre-computados con bcryptjs rounds=12 — sin dependencia de runtime
const HASHES = {
  admin:    '$2a$12$rkcdWYSksvYmYhFyOdJFSuEqTfA.P3VgANoR60ib2ZigcCEUN.cKO',  // Admin2025!
  manager:  '$2a$12$XdUrEwiiORu1f3l/1cK/YO33ZxUt.d4ToeohnUkCdgqG6bY3tkt5i',  // Manager2025!
  operator: '$2a$12$U51x1nDdZxNY3laVQ.1RVO.rQL0HC9.NMGKMv6nxX1eiT2CTWnYze',  // Operator2025!
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert('users', [
      {
        id:            '00000000-0000-0000-0000-000000000001',
        name:          'Administrador Sistema',
        email:         'admin@stockai.cl',
        password_hash: HASHES.admin,
        role:          'ROLE_ADMIN',
        mfa_enabled:   false,
        is_active:     true,
        last_login:    null,
        created_at:    now,
        updated_at:    now,
      },
      {
        id:            '00000000-0000-0000-0000-000000000002',
        name:          'Carlos Méndez',
        email:         'jefe@stockai.cl',
        password_hash: HASHES.manager,
        role:          'ROLE_MANAGER',
        mfa_enabled:   false,
        is_active:     true,
        last_login:    null,
        created_at:    now,
        updated_at:    now,
      },
      {
        id:            '00000000-0000-0000-0000-000000000003',
        name:          'Luis García',
        email:         'repositor@stockai.cl',
        password_hash: HASHES.operator,
        role:          'ROLE_OPERATOR',
        mfa_enabled:   false,
        is_active:     true,
        last_login:    null,
        created_at:    now,
        updated_at:    now,
      },
    ], {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', {
      id: [
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
      ],
    });
  },
};
