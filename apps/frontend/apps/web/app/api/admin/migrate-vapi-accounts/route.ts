import { NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/admin/migrate-vapi-accounts
 *
 * One-time migration endpoint. Sets voiceProviderOverride='VAPI' on all
 * accounts that have an active Vapi deployment (vapiSquadId in settings)
 * but do NOT already have a voiceProviderOverride set.
 *
 * This ensures existing Vapi accounts continue working after the platform
 * default was changed from VAPI to RETELL. New accounts will get RETELL
 * by default (no override).
 *
 * Admin-only. Safe to run multiple times (idempotent).
 */
export async function POST() {
  const logger = await getLogger();
  const funcName = 'POST /api/admin/migrate-vapi-accounts';

  try {
    await requireAdmin();

    const accounts = await prisma.account.findMany({
      where: {
        voiceProviderOverride: null,
        phoneIntegrationSettings: { not: undefined },
      },
      select: {
        id: true,
        name: true,
        phoneIntegrationSettings: true,
      },
    });

    let migratedCount = 0;
    const migrated: Array<{ id: string; name: string | null }> = [];

    for (const account of accounts) {
      const settings = account.phoneIntegrationSettings as any;
      const hasVapiSquad = !!settings?.vapiSquadId;

      if (hasVapiSquad) {
        await prisma.account.update({
          where: { id: account.id },
          data: { voiceProviderOverride: 'VAPI' },
        });

        migrated.push({ id: account.id, name: account.name });
        migratedCount++;
      }
    }

    logger.info(
      { funcName, totalChecked: accounts.length, migratedCount },
      '[Migration] Vapi account migration complete',
    );

    return NextResponse.json({
      success: true,
      totalChecked: accounts.length,
      migratedCount,
      migrated,
    });
  } catch (error) {
    logger.error(
      { funcName, error: error instanceof Error ? error.message : error },
      '[Migration] Failed',
    );

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 },
    );
  }
}
