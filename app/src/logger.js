const winston = require('winston');

const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `[${timestamp}] ${level}: ${message} ${metaStr}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    }),

    new winston.transports.File({
      filename: '/tmp/error.log',
      level: 'error',
      format: jsonFormat,
      maxsize: 5242880,  // 5MB
      maxFiles: 5
    }),

    new winston.transports.File({
      filename: '/tmp/app.log',
      format: jsonFormat,
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

module.exports = logger;
