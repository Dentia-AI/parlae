'use server';

import { prisma } from '@kit/prisma';

/**
 * Search for users with ADMIN role to grant access
 * This is a server action that can be called from client components
 */
export async function searchAdminUsersAction(
  search: string,
): Promise<Array<{ id: string; email: string; displayName: string | null; avatarUrl: string | null }>> {
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
}
