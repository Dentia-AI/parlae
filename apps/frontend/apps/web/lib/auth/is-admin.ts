import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';

/**
 * Check if the current user is an admin (ADMIN or SUPER_ADMIN)
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getSessionUser();

  if (!session) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { role: true },
  });

  if (!user) {
    return false;
  }

  return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
}

/**
 * Check if the current user is a super admin
 */
export async function isSuperAdmin(): Promise<boolean> {
  const session = await getSessionUser();

  if (!session) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { role: true },
  });

  if (!user) {
    return false;
  }

  return user.role === 'SUPER_ADMIN';
}

/**
 * Check if an admin has permission to impersonate a specific user
 * Super admins always have permission
 * Regular admins need explicit grant from the user
 */
export async function canImpersonateUser(
  adminId: string,
  targetUserId: string,
  accountId?: string,
): Promise<boolean> {
  // Check if admin is super admin
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { role: true },
  });

  if (!admin) {
    return false;
  }

  // Super admins can impersonate anyone (except other super admins)
  if (admin.role === 'SUPER_ADMIN') {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: true },
    });

    // Cannot impersonate another super admin
    if (targetUser?.role === 'SUPER_ADMIN') {
      return false;
    }

    return true;
  }

  // Regular admins need explicit permission
  const access = await prisma.adminAccess.findFirst({
    where: {
      adminId,
      grantedByUserId: targetUserId,
      isRevoked: false,
      ...(accountId ? { accountId } : {}),
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  return !!access;
}

/**
 * Require admin role or throw error
 */
export async function requireAdmin(): Promise<void> {
  const isAdminUser = await isAdmin();

  if (!isAdminUser) {
    throw new Error('Admin access required');
  }
}

/**
 * Require super admin role or throw error
 */
export async function requireSuperAdmin(): Promise<void> {
  const isSuperAdminUser = await isSuperAdmin();

  if (!isSuperAdminUser) {
    throw new Error('Super admin access required');
  }
}

/**
 * Get the current user's admin role (ADMIN, SUPER_ADMIN, or null)
 */
export async function getAdminRole(): Promise<'ADMIN' | 'SUPER_ADMIN' | null> {
  const session = await getSessionUser();

  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { role: true },
  });

  if (!user) {
    return null;
  }

  if (user.role === 'SUPER_ADMIN') {
    return 'SUPER_ADMIN';
  }

  if (user.role === 'ADMIN') {
    return 'ADMIN';
  }

  return null;
}

