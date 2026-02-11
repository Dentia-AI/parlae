import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';

import { prisma } from '@kit/prisma';

import type { JWTUserData } from './types';
import { auth } from './nextauth';

export const getSessionUser = cache(async (): Promise<JWTUserData | null> => {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;

  if (!userId) {
    return null;
  }

  // Check for active impersonation
  const cookieStore = await cookies();
  const impersonationToken = cookieStore.get('impersonation-token')?.value;

  if (impersonationToken) {
    const impersonationSession = await prisma.impersonationSession.findFirst({
      where: {
        sessionToken: impersonationToken,
        adminId: userId,
        isActive: true,
      },
      select: {
        targetUserId: true,
      },
    });

    if (impersonationSession) {
      // Return the impersonated user's data
      const targetUser = await prisma.user.findUnique({
        where: { id: impersonationSession.targetUserId },
      });

      if (targetUser) {
        return {
          id: targetUser.id,
          email: targetUser.email,
          phone: null,
          is_anonymous: false,
          aal: 'aal1',
          app_metadata: {},
          user_metadata: {},
          amr: [],
        };
      }
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  return {
    id: userId,
    email: user?.email ?? session?.user?.email ?? '',
    phone: null,
    is_anonymous: false,
    aal: 'aal1',
    app_metadata: {},
    user_metadata: {},
    amr: [],
  };
});
