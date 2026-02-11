import 'server-only';

import { cache } from 'react';

import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';

export interface AdminAccessItem {
  id: string;
  admin: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  grantedAt: Date;
  expiresAt: Date | null;
  isRevoked: boolean;
  revokedAt: Date | null;
  notes: string | null;
}

/**
 * Get all admin accesses granted by the current user for a specific account
 */
export const getAdminAccessesForAccount = cache(
  async (accountId: string): Promise<AdminAccessItem[]> => {
    const session = await getSessionUser();

    if (!session) {
      throw new Error('Not authenticated');
    }

    const accesses = await prisma.adminAccess.findMany({
      where: {
        grantedByUserId: session.id,
        accountId,
      },
      include: {
        admin: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });

    return accesses.map((access) => ({
      id: access.id,
      admin: access.admin,
      grantedAt: access.grantedAt,
      expiresAt: access.expiresAt,
      isRevoked: access.isRevoked,
      revokedAt: access.revokedAt,
      notes: access.notes,
    }));
  },
);

// Note: searchAdminUsers has been moved to server-actions.ts
// since it needs to be called from client components

