import { PrismaClient } from '@prisma/client';

import {
  encryptCallLogFields,
  decryptCallLogFields,
} from './encryption';

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

  // ---------------------------------------------------------------------------
  // PHI Encryption Middleware (HIPAA Compliance)
  //
  // Transparently encrypts PHI fields (transcript, summary, callNotes) before
  // they are written to the database, and decrypts them when read back.
  //
  // This ensures PHI is encrypted at the application layer *before* reaching
  // PostgreSQL/Aurora, providing defense-in-depth alongside Aurora's storage
  // encryption at rest.
  // ---------------------------------------------------------------------------
  client.$use(async (params, next) => {
    // Only apply to CallLog model
    if (params.model !== 'CallLog') {
      return next(params);
    }

    // --- Encrypt on write ---
    if (['create', 'update', 'upsert'].includes(params.action)) {
      if (params.args.data) {
        params.args.data = encryptCallLogFields(params.args.data);
      }
      // Handle upsert's create/update separately
      if (params.action === 'upsert') {
        if (params.args.create) {
          params.args.create = encryptCallLogFields(params.args.create);
        }
        if (params.args.update) {
          params.args.update = encryptCallLogFields(params.args.update);
        }
      }
    }

    // Handle createMany
    if (params.action === 'createMany' && params.args.data) {
      if (Array.isArray(params.args.data)) {
        params.args.data = params.args.data.map(encryptCallLogFields);
      } else {
        params.args.data = encryptCallLogFields(params.args.data);
      }
    }

    // Handle updateMany
    if (params.action === 'updateMany' && params.args.data) {
      params.args.data = encryptCallLogFields(params.args.data);
    }

    // Execute the query
    const result = await next(params);

    // --- Decrypt on read ---
    if (
      ['findFirst', 'findUnique', 'create', 'update', 'upsert'].includes(
        params.action,
      )
    ) {
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

  return client;
}

export const prisma = global.__prismaClient ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prismaClient = prisma;
}

export * from '@prisma/client';

// Re-export encryption utilities for use in migration scripts
export {
  encryptField,
  decryptField,
  isEncrypted,
  encryptCallLogFields,
  decryptCallLogFields,
} from './encryption';

