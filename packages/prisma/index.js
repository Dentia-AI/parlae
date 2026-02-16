const { PrismaClient } = require('@prisma/client');
const {
  encryptField,
  decryptField,
  isEncrypted,
} = require('./src/encryption');

const globalSymbol = Symbol.for('__PRISMA_CLIENT__');
const globalObject = globalThis;

if (!globalObject[globalSymbol]) {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  globalObject[globalSymbol] = client;
}

const prisma = globalObject[globalSymbol];

module.exports = {
  prisma,
  PrismaClient,
  encryptField,
  decryptField,
  isEncrypted,
  ...require('@prisma/client'),
};
