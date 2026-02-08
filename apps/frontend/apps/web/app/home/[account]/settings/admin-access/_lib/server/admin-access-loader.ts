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

/**
 * Search for users with ADMIN role to grant access
 */
export const searchAdminUsers = cache(
  async (search: string): Promise<Array<{ id: string; email: string; displayName: string | null; avatarUrl: string | null }>> => {
    const users = await prisma.user.findMany({
      where: {
        role: 'ADMIN',
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
      },
      take: 10,
    });

    return users;
  },
);

