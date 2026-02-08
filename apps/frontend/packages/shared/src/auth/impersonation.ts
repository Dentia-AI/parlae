import { cache } from 'react';
import { cookies } from 'next/headers';

import { prisma } from '@kit/prisma';
import { auth } from './nextauth';

export const getImpersonationInfo = cache(async () => {
  const cookieStore = await cookies();
  const impersonationToken = cookieStore.get('impersonation-token')?.value;

  console.log('[getImpersonationInfo] Token:', impersonationToken);

  if (!impersonationToken) {
    return null;
  }

  const session = await auth();
  const adminId = session?.user?.id as string | undefined;

  console.log('[getImpersonationInfo] Admin ID:', adminId);

  if (!adminId) {
    return null;
  }

  const impersonationSession = await prisma.impersonationSession.findFirst({
    where: {
      sessionToken: impersonationToken,
      adminId,
      isActive: true,
    },
    include: {
      admin: {
        select: {
          email: true,
          displayName: true,
        },
      },
      targetUser: {
        select: {
          email: true,
          displayName: true,
        },
      },
    },
  });

  console.log('[getImpersonationInfo] Session found:', !!impersonationSession);

  return impersonationSession;
});
