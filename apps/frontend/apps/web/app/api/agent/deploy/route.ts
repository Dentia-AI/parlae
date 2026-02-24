import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@kit/shared/auth/nextauth';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { executeDeployment } from '../../../home/(user)/agent/setup/_lib/actions';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/agent/deploy
 *
 * Fire-and-forget deployment endpoint. The review page calls this
 * without awaiting the response, so the user is redirected to the
 * overview page immediately while deployment runs in the background.
 *
 * The deployment status is tracked in `phoneIntegrationSettings.deploymentStatus`
 * and polled by the client via `/api/agent/deploy-status`.
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { voice: any; files?: any[]; knowledgeBaseConfig?: Record<string, string[]> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.voice) {
    return NextResponse.json({ error: 'Voice configuration is required' }, { status: 400 });
  }

  const userId = session.user.id;

  const account = await prisma.account.findFirst({
    where: { primaryOwnerId: userId },
    select: { id: true, phoneIntegrationSettings: true },
  });

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Mark deployment as in_progress (may already be set by the client action)
  const existingSettings = (account.phoneIntegrationSettings as Record<string, unknown>) || {};
  await prisma.account.update({
    where: { id: account.id },
    data: {
      phoneIntegrationSettings: {
        ...existingSettings,
        deploymentStatus: 'in_progress',
        deploymentStartedAt: new Date().toISOString(),
        deploymentError: null,
      },
    },
  });

  try {
    const result = await executeDeployment(userId, {
      voice: body.voice,
      files: body.files || [],
      knowledgeBaseConfig: body.knowledgeBaseConfig,
    });

    // Read fresh settings (executeDeployment writes vapiSquadId etc.)
    const freshAccount = await prisma.account.findUnique({
      where: { id: account.id },
      select: { phoneIntegrationSettings: true },
    });
    const freshSettings = (freshAccount?.phoneIntegrationSettings as Record<string, unknown>) || {};

    await prisma.account.update({
      where: { id: account.id },
      data: {
        phoneIntegrationSettings: {
          ...freshSettings,
          deploymentStatus: result.success ? 'completed' : 'failed',
          deploymentError: result.success ? null : (result.error || null),
          deploymentCompletedAt: new Date().toISOString(),
        },
      },
    });

    logger.info(
      { accountId: account.id, success: result.success },
      '[Deploy API] Deployment finished',
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error, userId }, '[Deploy API] Deployment failed with exception');

    try {
      const freshAccount = await prisma.account.findUnique({
        where: { id: account.id },
        select: { phoneIntegrationSettings: true },
      });
      const freshSettings = (freshAccount?.phoneIntegrationSettings as Record<string, unknown>) || {};

      await prisma.account.update({
        where: { id: account.id },
        data: {
          phoneIntegrationSettings: {
            ...freshSettings,
            deploymentStatus: 'failed',
            deploymentError: error instanceof Error ? error.message : 'Unknown error',
            deploymentCompletedAt: new Date().toISOString(),
          },
        },
      });
    } catch (statusErr) {
      logger.error({ error: statusErr }, '[Deploy API] Failed to mark deployment as failed');
    }

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Deployment failed' },
      { status: 500 },
    );
  }
}
