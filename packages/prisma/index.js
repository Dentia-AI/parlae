const { PrismaClient } = require('@prisma/client');
const {
  encryptCallLogFields,
  decryptCallLogFields,
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

  // ---------------------------------------------------------------------------
  // PHI Encryption Middleware (HIPAA Compliance)
  // Transparently encrypts/decrypts transcript, summary, callNotes fields
  // on CallLog model using AES-256-GCM before data reaches the database.
  // ---------------------------------------------------------------------------
  client.$use(async (params, next) => {
    if (params.model !== 'CallLog') {
      return next(params);
    }

    // Encrypt on write
    if (['create', 'update', 'upsert'].includes(params.action)) {
      if (params.args.data) {
        params.args.data = encryptCallLogFields(params.args.data);
      }
      if (params.action === 'upsert') {
        if (params.args.create) {
          params.args.create = encryptCallLogFields(params.args.create);
        }
        if (params.args.update) {
          params.args.update = encryptCallLogFields(params.args.update);
        }
      }
    }

    if (params.action === 'createMany' && params.args.data) {
      if (Array.isArray(params.args.data)) {
        params.args.data = params.args.data.map(encryptCallLogFields);
      } else {
        params.args.data = encryptCallLogFields(params.args.data);
      }
    }

    if (params.action === 'updateMany' && params.args.data) {
      params.args.data = encryptCallLogFields(params.args.data);
    }

    const result = await next(params);

    // Decrypt on read
    if (['findFirst', 'findUnique', 'create', 'update', 'upsert'].includes(params.action)) {
      if (result) {
        return decryptCallLogFields(result);
      }
    }

    if (params.action === 'findMany') {
      if (Array.isArray(result)) {
        return result.map(decryptCallLogFields);
      }
    }

    return result;
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
  encryptCallLogFields,
  decryptCallLogFields,
  ...require('@prisma/client'),
};
