#!/usr/bin/env tsx
/**
 * One-Time Migration Script: Encrypt Existing CallLog PHI Fields
 *
 * This script encrypts existing plaintext transcript, summary, and callNotes
 * fields in the call_logs table using AES-256-GCM application-level encryption.
 *
 * IMPORTANT:
 * - Requires ENCRYPTION_KEY environment variable (64-character hex string)
 * - Uses raw SQL to bypass Prisma middleware (avoids double-encryption)
 * - Processes records in batches for memory efficiency
 * - Safe to re-run: skips already-encrypted values (detects `enc:v1:` prefix)
 * - Logs progress and can be monitored
 *
 * Usage:
 *   DATABASE_URL="..." ENCRYPTION_KEY="..." npx tsx packages/prisma/scripts/encrypt-existing-call-logs.ts
 *
 * Options:
 *   --dry-run    Preview what would be encrypted without making changes
 *   --batch-size Override the default batch size (default: 100)
 */

import { PrismaClient } from '@prisma/client';
import { encryptField, isEncrypted } from '../src/encryption';

const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '100');
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('=== CallLog PHI Encryption Migration ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log();

  if (!process.env.ENCRYPTION_KEY) {
    console.error('ERROR: ENCRYPTION_KEY environment variable is required.');
    process.exit(1);
  }

  if (process.env.ENCRYPTION_KEY.length !== 64) {
    console.error('ERROR: ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
    process.exit(1);
  }

  // Use a raw PrismaClient (without middleware) to avoid double-encryption
  const prisma = new PrismaClient({
    log: ['error'],
  });

  try {
    // Count total records that may need encryption
    const totalResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM call_logs
      WHERE transcript IS NOT NULL
         OR summary IS NOT NULL
         OR call_notes IS NOT NULL
    `;
    const totalRecords = Number(totalResult[0]?.count || 0);

    console.log(`Total records with PHI fields: ${totalRecords}`);

    if (totalRecords === 0) {
      console.log('No records to process. Done.');
      return;
    }

    let processed = 0;
    let encrypted = 0;
    let skipped = 0;
    let errors = 0;
    let offset = 0;

    while (offset < totalRecords) {
      // Fetch a batch using raw query to bypass middleware
      const batch = await prisma.$queryRaw<Array<{
        id: string;
        transcript: string | null;
        summary: string | null;
        call_notes: string | null;
      }>>`
        SELECT id, transcript, summary, call_notes
        FROM call_logs
        WHERE transcript IS NOT NULL
           OR summary IS NOT NULL
           OR call_notes IS NOT NULL
        ORDER BY created_at ASC
        LIMIT ${BATCH_SIZE}
        OFFSET ${offset}
      `;

      if (batch.length === 0) break;

      for (const row of batch) {
        processed++;

        try {
          let needsUpdate = false;
          const updates: { transcript?: string; summary?: string; call_notes?: string } = {};

          // Check each field
          if (row.transcript && !isEncrypted(row.transcript)) {
            updates.transcript = encryptField(row.transcript);
            needsUpdate = true;
          }
          if (row.summary && !isEncrypted(row.summary)) {
            updates.summary = encryptField(row.summary);
            needsUpdate = true;
          }
          if (row.call_notes && !isEncrypted(row.call_notes)) {
            updates.call_notes = encryptField(row.call_notes);
            needsUpdate = true;
          }

          if (!needsUpdate) {
            skipped++;
            continue;
          }

          if (!DRY_RUN) {
            // Update using raw SQL to bypass middleware
            await prisma.$executeRaw`
              UPDATE call_logs
              SET
                transcript = COALESCE(${updates.transcript ?? null}, transcript),
                summary = COALESCE(${updates.summary ?? null}, summary),
                call_notes = COALESCE(${updates.call_notes ?? null}, call_notes),
                updated_at = NOW()
              WHERE id = ${row.id}
            `;
          }

          encrypted++;
        } catch (error) {
          errors++;
          console.error(
            `  ERROR encrypting row ${row.id}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      offset += batch.length;
      const pct = Math.round((processed / totalRecords) * 100);
      console.log(
        `  Progress: ${processed}/${totalRecords} (${pct}%) — ` +
        `encrypted: ${encrypted}, skipped: ${skipped}, errors: ${errors}`,
      );
    }

    console.log();
    console.log('=== Migration Complete ===');
    console.log(`  Total processed: ${processed}`);
    console.log(`  Newly encrypted: ${encrypted}`);
    console.log(`  Already encrypted (skipped): ${skipped}`);
    console.log(`  Errors: ${errors}`);

    if (DRY_RUN) {
      console.log();
      console.log('DRY RUN — no changes were made. Remove --dry-run to execute.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
