import 'server-only';

import { prisma } from '@kit/prisma';

export type VoiceProviderType = 'VAPI' | 'RETELL';

/**
 * Resolve the effective voice provider for an account.
 *
 * Priority:
 *   1. Account-level override (`voiceProviderOverride`)
 *   2. Global toggle (`VoiceProviderToggle.activeProvider`)
 *   3. Default: VAPI
 */
export async function getAccountProvider(
  accountId: string,
): Promise<VoiceProviderType> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { voiceProviderOverride: true },
  });

  if (account?.voiceProviderOverride) {
    return account.voiceProviderOverride as VoiceProviderType;
  }

  try {
    const toggle = await prisma.voiceProviderToggle.findFirst({
      where: { id: 1 },
    });

    if (toggle?.activeProvider) {
      return toggle.activeProvider as VoiceProviderType;
    }
  } catch {
    // Table may not exist yet in some environments
  }

  return 'VAPI';
}

/**
 * Resolve provider for an account that's already been loaded.
 * Avoids an extra DB query when you already have the account data.
 */
export async function getAccountProviderFromOverride(
  voiceProviderOverride: string | null | undefined,
): Promise<VoiceProviderType> {
  if (voiceProviderOverride === 'RETELL' || voiceProviderOverride === 'VAPI') {
    return voiceProviderOverride;
  }

  try {
    const toggle = await prisma.voiceProviderToggle.findFirst({
      where: { id: 1 },
    });

    if (toggle?.activeProvider) {
      return toggle.activeProvider as VoiceProviderType;
    }
  } catch {
    // Table may not exist yet
  }

  return 'VAPI';
}
