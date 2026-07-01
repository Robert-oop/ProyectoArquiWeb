'use strict';

module.exports = {
  development: {
    username: process.env.POSTGRES_USER     || 'stockai_user',
    password: process.env.POSTGRES_PASSWORD || 'stockai_pass',
    database: process.env.POSTGRES_DB       || 'stockai_db',
    host:     process.env.POSTGRES_SERVER   || 'postgres',
    port:     parseInt(process.env.POSTGRES_PORT || '5432'),
    dialect:  'postgres',
    logging:  false,
  },
  test: {
    username: 'stockai_user',
    password: 'stockai_pass',
    database: 'stockai_test',
    host:     'localhost',
    port:     5432,
    dialect:  'postgres',
    logging:  false,
  },
  production: {
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    host:     process.env.POSTGRES_SERVER,
    port:     parseInt(process.env.POSTGRES_PORT || '5432'),
    dialect:  'postgres',
    logging:  false,
  },
};
