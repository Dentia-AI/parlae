import { cookies } from 'next/headers';

import { auth } from '@kit/shared/auth/nextauth';
import { prisma } from '@kit/prisma';

/**
 * Get the current user session on the server
 * Returns null if no session exists
 */
export async function getSession() {
  return await auth();
}

/**
 * Get the current user from session, with impersonation support.
 * Returns the impersonated user's info when impersonation is active.
 */
export async function getUser() {
  const effectiveId = await getEffectiveUserId();
  if (!effectiveId) return null;

  const session = await auth();
  const realId = session?.user?.id;

  if (realId && realId !== effectiveId) {
    return { ...session?.user, id: effectiveId };
  }

  return session?.user || null;
}

/**
 * Resolve the effective user ID accounting for admin impersonation.
 * When an admin impersonates another user, this returns the target user's ID.
 * Otherwise returns the authenticated user's ID.
 */
export async function getEffectiveUserId(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;

  if (!userId) {
    return null;
  }

  try {
    const cookieStore = await cookies();
    const impersonationToken = cookieStore.get('impersonation-token')?.value;

    if (impersonationToken) {
      const impersonationSession = await prisma.impersonationSession.findFirst({
        where: {
          sessionToken: impersonationToken,
          adminId: userId,
          isActive: true,
        },
        select: { targetUserId: true },
      });

      if (impersonationSession) {
        return impersonationSession.targetUserId;
      }
    }
  } catch {
    // Impersonation table may not exist; fall through to real user
  }

  return userId;
}

/**
 * Get the current user session and throw if not authenticated.
 * Use this in API routes that require authentication.
 *
 * When an admin is impersonating another user, the returned session's
 * user.id is replaced with the impersonated user's ID so that all
 * downstream account lookups resolve to the correct account.
 */
export async function requireSession() {
  const session = await getSession();

  if (!session || !session.user) {
    throw new Error('Unauthorized');
  }

  const effectiveId = await getEffectiveUserId();

  if (effectiveId && effectiveId !== session.user.id) {
    return {
      ...session,
      user: { ...session.user, id: effectiveId },
    };
  }

  return session;
}
