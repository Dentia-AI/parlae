import pino from 'pino';

/**
 * @name Logger
 * @description A logger implementation using Pino
 */
const Logger = pino({
  browser: {
    asObject: true,
  },
  level: 'debug',
  base: {
    env: process.env.NODE_ENV,
  },
  errorKey: 'error',
  formatters: {
    level(label, number) {
      return { level: number, levelLabel: label.toUpperCase() };
    },
  },
  // In production, ensure we're using JSON format with all fields
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

export { Logger };
