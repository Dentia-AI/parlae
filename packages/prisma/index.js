const { PrismaClient } = require('@prisma/client');

const globalSymbol = Symbol.for('__PRISMA_CLIENT__');
const globalObject = globalThis;

if (!globalObject[globalSymbol]) {
  globalObject[globalSymbol] = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

const prisma = globalObject[globalSymbol];

module.exports = {
  prisma,
  PrismaClient,
  ...require('@prisma/client'),
};
