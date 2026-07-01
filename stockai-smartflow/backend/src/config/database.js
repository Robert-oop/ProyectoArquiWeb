'use strict';
const { Sequelize } = require('sequelize');
const logger = require('./logger');

const sequelize = new Sequelize(
  process.env.POSTGRES_DB       || 'stockai_db',
  process.env.POSTGRES_USER     || 'stockai_user',
  process.env.POSTGRES_PASSWORD || 'stockai_pass',
  {
    host:    process.env.POSTGRES_SERVER || 'localhost',
    port:    parseInt(process.env.POSTGRES_PORT || '5432'),
    dialect: 'postgres',
    logging: (sql) => logger.debug(sql),
    pool: {
      max:     10,
      min:     2,
      acquire: 30_000,
      idle:    10_000,
    },
    define: {
      underscored:   true,   // snake_case en BD
      freezeTableName: false,
      timestamps:    true,
      paranoid:      true,   // soft delete global (deletedAt)
    },
  }
);

module.exports = sequelize;
