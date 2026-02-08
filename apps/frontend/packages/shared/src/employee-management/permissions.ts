import { prisma } from '@kit/prisma';
import type { AppPermission } from '@prisma/client';

/**
 * Checks if a user has a specific permission on an account
 */
export async function hasPermission(
  userId: string,
  accountId: string,
  permission: AppPermission
): Promise<boolean> {
  // Check if user is the account owner (owners have all permissions)
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { primaryOwnerId: true },
  });

  if (account?.primaryOwnerId === userId) {
    return true;
  }

  // Check the user's membership and role permissions
  const membership = await prisma.accountMembership.findUnique({
    where: {
      accountId_userId: {
        accountId,
        userId,
      },
    },
    include: {
      role: {
        include: {
          permissions: {
            select: {
              permission: true,
            },
          },
        },
      },
    },
  });

  if (!membership) {
    return false;
  }

  // Check if the role has the required permission
  return membership.role.permissions.some((p) => p.permission === permission);
}

/**
 * Gets all accounts a user has access to
 */
export async function getUserAccounts(userId: string) {
  const accounts = await prisma.account.findMany({
    where: {
      OR: [
        { primaryOwnerId: userId }, // Accounts they own
        {
          memberships: {
            some: {
              userId, // Accounts they're a member of
            },
          },
        },
      ],
    },
    include: {
      memberships: {
        where: { userId },
        include: {
          role: {
            include: {
              permissions: {
                select: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return accounts.map((account) => ({
    ...account,
    permissions: account.memberships[0]?.role.permissions.map((p) => p.permission) || [],
    roleName: account.memberships[0]?.roleName || 'owner',
  }));
}

/**
 * Gets all employees who have access to an account
 */
export async function getAccountEmployees(accountId: string) {
  const memberships = await prisma.accountMembership.findMany({
    where: {
      accountId,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          createdAt: true,
        },
      },
      role: {
        select: {
          name: true,
          hierarchyLevel: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return memberships;
}

/**
 * Gets all permissions for a user on a specific account
 */
export async function getAccountPermissions(
  userId: string,
  accountId: string
): Promise<AppPermission[]> {
  // Check if user is the account owner
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { primaryOwnerId: true },
  });

  if (account?.primaryOwnerId === userId) {
    // Return all permissions for owners
    return [
      'ROLES_MANAGE',
      'BILLING_MANAGE',
      'SETTINGS_MANAGE',
      'MEMBERS_MANAGE',
      'INVITES_MANAGE',
      'CAMPAIGNS_VIEW',
      'CAMPAIGNS_CREATE',
      'CAMPAIGNS_EDIT',
      'CAMPAIGNS_DELETE',
      'ADS_VIEW',
      'ADS_CREATE',
      'ADS_EDIT',
      'ADS_DELETE',
      'ANALYTICS_VIEW',
    ];
  }

  // Get permissions from role
  const membership = await prisma.accountMembership.findUnique({
    where: {
      accountId_userId: {
        accountId,
        userId,
      },
    },
    include: {
      role: {
        include: {
          permissions: {
            select: {
              permission: true,
            },
          },
        },
      },
    },
  });

  return membership?.role.permissions.map((p) => p.permission) || [];
}

/**
 * Checks if a user can manage another user's role
 * (Can only manage users with equal or lower hierarchy)
 */
export async function canManageUser(
  managerId: string,
  targetUserId: string,
  accountId: string
): Promise<boolean> {
  // Account owner can manage anyone
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { primaryOwnerId: true },
  });

  if (account?.primaryOwnerId === managerId) {
    return true;
  }

  // Get both users' roles
  const [managerMembership, targetMembership] = await Promise.all([
    prisma.accountMembership.findUnique({
      where: {
        accountId_userId: {
          accountId,
          userId: managerId,
        },
      },
      include: {
        role: {
          select: {
            hierarchyLevel: true,
          },
        },
      },
    }),
    prisma.accountMembership.findUnique({
      where: {
        accountId_userId: {
          accountId,
          userId: targetUserId,
        },
      },
      include: {
        role: {
          select: {
            hierarchyLevel: true,
          },
        },
      },
    }),
  ]);

  if (!managerMembership || !targetMembership) {
    return false;
  }

  // Can manage if manager's hierarchy is lower (more powerful)
  return managerMembership.role.hierarchyLevel < targetMembership.role.hierarchyLevel;
}

