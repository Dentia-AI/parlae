import { NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getEffectiveUserId } from '~/lib/auth/get-session';

/**
 * GET /api/agent/deploy-status
 *
 * Returns the current deployment status for the authenticated user's account.
 * Used by the deploying animation component to poll for completion.
 */
export async function GET() {
  const userId = await getEffectiveUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const account = await prisma.account.findFirst({
    where: { primaryOwnerId: userId },
    select: {
      phoneIntegrationSettings: true,
      phoneIntegrationMethod: true,
    },
  });

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const settings = (account.phoneIntegrationSettings as Record<string, unknown>) || {};

  const status = (settings.deploymentStatus as string) ||
    (settings.vapiSquadId ? 'completed' : 'not_started');

  return NextResponse.json({
    status,
    vapiSquadId: (settings.vapiSquadId as string) || null,
    phoneNumber: (settings.phoneNumber as string) || null,
    error: (settings.deploymentError as string) || null,
    startedAt: (settings.deploymentStartedAt as string) || null,
    completedAt: (settings.deploymentCompletedAt as string) || null,
  });
}
