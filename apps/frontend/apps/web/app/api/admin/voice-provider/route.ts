import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';
import { getLogger } from '@kit/shared/logger';

/**
 * GET /api/admin/voice-provider
 *
 * Returns the current global active voice AI provider.
 */
export async function GET() {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const toggle = await prisma.voiceProviderToggle.findFirst({
      where: { id: 1 },
    });

    return NextResponse.json({
      activeProvider: toggle?.activeProvider || 'RETELL',
      switchedAt: toggle?.switchedAt || null,
      switchedBy: toggle?.switchedBy || null,
    });
  } catch (error) {
    logger.error({ error }, '[VoiceProvider] Failed to get toggle');
    return NextResponse.json(
      { error: 'Failed to get voice provider' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/voice-provider
 *
 * Switch the global active voice AI provider.
 *
 * Body:
 * {
 *   provider: "VAPI" | "RETELL"
 * }
 */
export async function PATCH(request: NextRequest) {
  const logger = await getLogger();
  const funcName = 'PATCH /api/admin/voice-provider';

  try {
    await requireAdmin();

    const body = await request.json();
    const { provider } = body;

    if (!provider || !['VAPI', 'RETELL'].includes(provider)) {
      return NextResponse.json(
        { error: 'provider must be "VAPI" or "RETELL"' },
        { status: 400 },
      );
    }

    const result = await prisma.voiceProviderToggle.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        activeProvider: provider,
        switchedAt: new Date(),
      },
      update: {
        activeProvider: provider,
        switchedAt: new Date(),
      },
    });

    logger.info(
      { funcName, provider },
      `[VoiceProvider] Switched to ${provider}`,
    );

    return NextResponse.json({
      activeProvider: result.activeProvider,
      switchedAt: result.switchedAt,
      switchedBy: result.switchedBy,
    });
  } catch (error) {
    logger.error(
      { funcName, error: error instanceof Error ? error.message : error },
      '[VoiceProvider] Failed to switch',
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to switch provider' },
      { status: 500 },
    );
  }
}
