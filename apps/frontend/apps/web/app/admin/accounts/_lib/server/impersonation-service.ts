import { randomBytes } from 'crypto';

import { prisma } from '@kit/prisma';

export interface ImpersonationSession {
  id: string;
  sessionToken: string;
  adminId: string;
  targetUserId: string;
  accountId: string | null;
  startedAt: Date;
  targetUser: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  account: {
    id: string;
    name: string;
  } | null;
}

export interface ImpersonationStatus {
  isImpersonating: boolean;
  sessionToken?: string;
  targetUser?: {
    id: string;
    email: string;
    displayName: string | null;
  };
  admin?: {
    id: string;
    email: string;
    displayName: string | null;
  };
  startedAt?: Date;
}

/**
 * Generate a secure random session token
 */
function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Start an impersonation session
 */
export async function startImpersonation(
  adminId: string,
  targetUserId: string,
  accountId: string | null,
  autoRevokeAccess: boolean,
  ipAddress?: string,
  userAgent?: string,
): Promise<ImpersonationSession> {
  // Verify target user exists and is not a super admin
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      role: true,
    },
  });

  if (!targetUser) {
    throw new Error('Target user not found');
  }

  if (targetUser.role === 'SUPER_ADMIN') {
    throw new Error('Cannot impersonate super admin');
  }

  // Check for existing active session
  const existingSession = await prisma.impersonationSession.findFirst({
    where: {
      adminId,
      isActive: true,
    },
  });

  if (existingSession) {
    throw new Error('You already have an active impersonation session. Please end it first.');
  }

  // Generate unique session token
  const sessionToken = generateSessionToken();

  // Get account info if provided
  let account = null;
  if (accountId) {
    account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, name: true },
    });
  }

  // Create session
  const session = await prisma.impersonationSession.create({
    data: {
      adminId,
      targetUserId,
      accountId,
      sessionToken,
      autoRevokeAccess,
      ipAddress,
      userAgent,
    },
    include: {
      targetUser: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      account: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return {
    id: session.id,
    sessionToken: session.sessionToken,
    adminId: session.adminId,
    targetUserId: session.targetUserId,
    accountId: session.accountId,
    startedAt: session.startedAt,
    targetUser: session.targetUser,
    account: session.account,
  };
}

/**
 * End an impersonation session
 */
export async function endImpersonation(
  sessionToken: string,
  adminId: string,
): Promise<void> {
  const session = await prisma.impersonationSession.findUnique({
    where: {
      sessionToken,
      isActive: true,
    },
  });

  if (!session) {
    throw new Error('Active impersonation session not found');
  }

  if (session.adminId !== adminId) {
    throw new Error('This session does not belong to you');
  }

  // End the session
  await prisma.impersonationSession.update({
    where: { id: session.id },
    data: {
      isActive: false,
      endedAt: new Date(),
    },
  });

  // If auto-revoke is enabled, revoke the admin access
  if (session.autoRevokeAccess) {
    await prisma.adminAccess.updateMany({
      where: {
        adminId,
        accountId: session.accountId ?? undefined,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
  }
}

/**
 * Get current impersonation status for an admin
 */
export async function getImpersonationStatus(
  adminId: string,
): Promise<ImpersonationStatus> {
  const session = await prisma.impersonationSession.findFirst({
    where: {
      adminId,
      isActive: true,
    },
    include: {
      admin: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
      targetUser: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  });

  if (!session) {
    return {
      isImpersonating: false,
    };
  }

  // Check if session is expired (older than 24 hours)
  const sessionAge = Date.now() - session.startedAt.getTime();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  if (sessionAge > maxAge) {
    // Auto-expire session
    await prisma.impersonationSession.update({
      where: { id: session.id },
      data: { isActive: false, endedAt: new Date() },
    });

    return {
      isImpersonating: false,
    };
  }

  return {
    isImpersonating: true,
    sessionToken: session.sessionToken,
    targetUser: session.targetUser,
    admin: session.admin,
    startedAt: session.startedAt,
  };
}

/**
 * Get impersonation status by token
 */
export async function getImpersonationStatusByToken(
  sessionToken: string,
): Promise<ImpersonationStatus> {
  const session = await prisma.impersonationSession.findUnique({
    where: {
      sessionToken,
      isActive: true,
    },
    include: {
      admin: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
      targetUser: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
  });

  if (!session) {
    return {
      isImpersonating: false,
    };
  }

  return {
    isImpersonating: true,
    sessionToken: session.sessionToken,
    targetUser: session.targetUser,
    admin: session.admin,
    startedAt: session.startedAt,
  };
}

