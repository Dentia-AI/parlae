'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { prisma } from '@kit/prisma';
import { getSessionUser, auth } from '@kit/shared/auth';

import { canImpersonateUser, getAdminRole } from '~/lib/auth/is-admin';

import {
  startImpersonation,
  endImpersonation,
} from './impersonation-service';

const IMPERSONATION_COOKIE_NAME = 'impersonation-token';

/**
 * Start impersonating a user
 */
export async function startImpersonationAction(
  targetUserId: string,
  accountId?: string,
) {
  const session = await getSessionUser();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const adminRole = await getAdminRole();

  if (!adminRole) {
    throw new Error('Admin access required');
  }

  // Check if admin has permission to impersonate this user
  const hasPermission = await canImpersonateUser(
    session.id,
    targetUserId,
    accountId,
  );

  if (!hasPermission) {
    throw new Error(
      'You do not have permission to impersonate this user. User must grant you access first.',
    );
  }

  // Determine if this is a regular admin (auto-revoke access after session)
  const autoRevokeAccess = adminRole === 'ADMIN';

  // Start the impersonation session
  const impersonationSession = await startImpersonation(
    session.id,
    targetUserId,
    accountId ?? null,
    autoRevokeAccess,
  );

  // Store the session token in a cookie
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE_NAME, impersonationSession.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60, // 24 hours
    path: '/',
  });

  return {
    success: true,
    sessionToken: impersonationSession.sessionToken,
    targetUser: impersonationSession.targetUser,
  };
}

/**
 * End current impersonation session
 */
export async function endImpersonationAction() {
  const session = await auth();
  const adminId = session?.user?.id;

  if (!adminId) {
    throw new Error('Not authenticated');
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    throw new Error('No active impersonation session');
  }

  // End the impersonation session
  await endImpersonation(sessionToken, adminId);

  // Clear the cookie
  cookieStore.delete(IMPERSONATION_COOKIE_NAME);

  // Redirect back to admin accounts page
  redirect('/admin/accounts');
}

/**
 * Grant admin access to a user
 */
export async function grantAdminAccessAction(data: {
  adminId: string;
  accountId?: string;
  expiresAt?: Date;
  notes?: string;
}) {
  const session = await getSessionUser();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const adminRole = await getAdminRole();

  // Verify the target admin user exists and has ADMIN role
  const adminUser = await prisma.user.findUnique({
    where: { id: data.adminId },
    select: { role: true, email: true },
  });

  if (!adminUser) {
    throw new Error('Admin user not found');
  }

  if (adminUser.role !== 'ADMIN') {
    throw new Error('User must have ADMIN role');
  }

  // If accountId is provided and user is not super admin, verify ownership
  if (data.accountId && adminRole !== 'SUPER_ADMIN') {
    const account = await prisma.account.findUnique({
      where: { id: data.accountId },
      select: { primaryOwnerId: true },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    if (account.primaryOwnerId !== session.id) {
      throw new Error('Only account owner can grant admin access');
    }
  }

  // Check if access already exists
  const existingAccess = await prisma.adminAccess.findFirst({
    where: {
      adminId: data.adminId,
      grantedByUserId: session.id,
      accountId: data.accountId,
      isRevoked: false,
    },
  });

  if (existingAccess) {
    throw new Error('Admin access already granted');
  }

  // Create admin access
  const access = await prisma.adminAccess.create({
    data: {
      adminId: data.adminId,
      grantedByUserId: session.id,
      accountId: data.accountId,
      expiresAt: data.expiresAt,
      notes: data.notes,
    },
    include: {
      admin: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
  });

  return {
    success: true,
    access,
  };
}

/**
 * Revoke admin access
 */
export async function revokeAdminAccessAction(data: {
  adminId: string;
  accountId?: string;
}) {
  const session = await getSessionUser();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const adminRole = await getAdminRole();

  // Find the access record
  const access = await prisma.adminAccess.findFirst({
    where: {
      adminId: data.adminId,
      accountId: data.accountId,
      isRevoked: false,
    },
  });

  if (!access) {
    throw new Error('Admin access not found or already revoked');
  }

  // Only the granter or super admin can revoke
  if (adminRole !== 'SUPER_ADMIN' && access.grantedByUserId !== session.id) {
    throw new Error('Only the granter or super admin can revoke access');
  }

  // Revoke access
  await prisma.adminAccess.update({
    where: { id: access.id },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
    },
  });

  // End any active impersonation sessions for this admin
  await prisma.impersonationSession.updateMany({
    where: {
      adminId: data.adminId,
      accountId: data.accountId,
      isActive: true,
    },
    data: {
      isActive: false,
      endedAt: new Date(),
    },
  });

  return {
    success: true,
  };
}

