'use strict';
const { createLogger, format, transports } = require('winston');
const DailyRotate = require('winston-daily-rotate-file');

const { combine, timestamp, printf, colorize, errors } = format;

const fmt = printf(({ level, message, timestamp, stack }) =>
  `${timestamp} [${level}] ${stack || message}`
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), fmt),
  transports: [
    new transports.Console({
      format: combine(colorize(), errors({ stack: true }), timestamp({ format: 'HH:mm:ss' }), fmt),
    }),
    new DailyRotate({
      filename:    'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level:       'error',
      maxFiles:    '30d',
      zippedArchive: true,
    }),
    new DailyRotate({
      filename:    'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles:    '14d',
      zippedArchive: true,
    }),
  ],
});

module.exports = logger;
