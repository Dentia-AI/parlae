import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';
import { getLogger } from '@kit/shared/logger';

/**
 * PATCH /api/admin/accounts/voice-provider
 *
 * Set or clear the per-account voice provider override.
 * This lets you test Retell for a single account while the global toggle stays on VAPI.
 *
 * Body:
 * {
 *   accountId: string,
 *   provider: "VAPI" | "RETELL" | null   // null clears the override (use global toggle)
 * }
 */
export async function PATCH(request: NextRequest) {
  const logger = await getLogger();
  const funcName = 'PATCH /api/admin/accounts/voice-provider';

  try {
    await requireAdmin();

    const body = await request.json();
    const { accountId, provider } = body;

    if (!accountId || typeof accountId !== 'string') {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 },
      );
    }

    if (provider !== null && provider !== 'VAPI' && provider !== 'RETELL') {
      return NextResponse.json(
        { error: 'provider must be "VAPI", "RETELL", or null (to clear override)' },
        { status: 400 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, name: true },
    });

    if (!account) {
      return NextResponse.json(
        { error: `Account ${accountId} not found` },
        { status: 404 },
      );
    }

    if (provider === 'RETELL') {
      const retellCount = await prisma.retellPhoneNumber.count({
        where: { accountId, isActive: true },
      });

      if (retellCount === 0) {
        return NextResponse.json(
          {
            error: `No Retell agents deployed for account "${account.name}". Deploy first via POST /api/admin/retell-deploy.`,
          },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.account.update({
      where: { id: accountId },
      data: { voiceProviderOverride: provider },
      select: {
        id: true,
        name: true,
        voiceProviderOverride: true,
      },
    });

    logger.info(
      { funcName, accountId, provider },
      `[VoiceProvider] Account override set: ${account.name} → ${provider ?? 'cleared (use global)'}`,
    );

    return NextResponse.json({
      accountId: updated.id,
      accountName: updated.name,
      voiceProviderOverride: updated.voiceProviderOverride,
      message: provider
        ? `Account "${updated.name}" will use ${provider} regardless of global toggle`
        : `Account "${updated.name}" override cleared; will follow global toggle`,
    });
  } catch (error) {
    logger.error(
      { funcName, error: error instanceof Error ? error.message : error },
      '[VoiceProvider] Failed to set account override',
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set override' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/admin/accounts/voice-provider
 *
 * List all accounts that have a voice provider override set.
 */
export async function GET() {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const accounts = await prisma.account.findMany({
      where: { voiceProviderOverride: { not: null } },
      select: {
        id: true,
        name: true,
        voiceProviderOverride: true,
        retellPhoneNumbers: {
          where: { isActive: true },
          select: { phoneNumber: true, retellAgentId: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    logger.error({ error }, '[VoiceProvider] Failed to list account overrides');
    return NextResponse.json(
      { error: 'Failed to list overrides' },
      { status: 500 },
    );
  }
}
