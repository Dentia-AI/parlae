import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import crypto from 'crypto';

type InviteEmployeeParams = {
  email: string;
  displayName?: string;
  accountIds: string[];
  roleName: string;
  invitedByUserId: string;
};

/**
 * Generates a secure random invitation token
 */
function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a unique username for invited employee (before they sign up)
 */
function generateTempUsername(email: string): string {
  const [local] = email.split('@');
  return `${local}_${Date.now()}_pending`;
}

/**
 * Invites an employee and grants them access to specified accounts
 */
export async function inviteEmployee(params: InviteEmployeeParams) {
  const logger = await getLogger();
  const { email, displayName, accountIds, roleName, invitedByUserId } = params;

  logger.info({
    email,
    accountIds,
    roleName,
    invitedByUserId,
  }, '[EmployeeManagement] Inviting employee');

  return prisma.$transaction(async (tx) => {
    // 1. Verify the inviter has permission to invite to all specified accounts
    for (const accountId of accountIds) {
      const account = await tx.account.findUnique({
        where: { id: accountId },
        select: { primaryOwnerId: true },
      });

      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      // Only the account owner can invite employees
      if (account.primaryOwnerId !== invitedByUserId) {
        const membership = await tx.accountMembership.findUnique({
          where: {
            accountId_userId: {
              accountId,
              userId: invitedByUserId,
            },
          },
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
          },
        });

        const hasInvitePermission = membership?.role.permissions.some(
          (p) => p.permission === 'INVITES_MANAGE'
        );

        if (!hasInvitePermission) {
          throw new Error('You do not have permission to invite employees to this account');
        }
      }
    }

    // 2. Check if employee already exists
    const existingUser = await tx.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // If user exists and is an employee, we can grant them access
      if (existingUser.role === 'EMPLOYEE') {
        // Grant access to the new accounts
        for (const accountId of accountIds) {
          await tx.accountMembership.upsert({
            where: {
              accountId_userId: {
                accountId,
                userId: existingUser.id,
              },
            },
            update: {
              roleName,
            },
            create: {
              accountId,
              userId: existingUser.id,
              roleName,
            },
          });
        }

        logger.info({
          email,
          userId: existingUser.id,
          accountIds,
        }, '[EmployeeManagement] Granted existing employee access to accounts');

        return {
          employee: existingUser,
          isNewInvite: false,
        };
      } else {
        // User exists but is an account manager
        throw new Error('This email is already registered as an account manager');
      }
    }

    // 3. Create invitation records for each account
    const inviteToken = generateInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    for (const accountId of accountIds) {
      await tx.invitation.create({
        data: {
          accountId,
          email: email.toLowerCase(),
          inviteToken,
          invitedBy: invitedByUserId,
          roleName,
          expiresAt,
        },
      });
    }

    logger.info({
      email,
      accountIds,
      inviteToken,
      expiresAt,
    }, '[EmployeeManagement] Created invitations');

    return {
      inviteToken,
      expiresAt,
      email,
      accountIds,
      isNewInvite: true,
    };
  });
}

/**
 * Accepts an invitation and creates the employee user
 */
export async function acceptInvitation(params: {
  inviteToken: string;
  userId: string;
  email: string;
  displayName?: string;
  cognitoUsername?: string;
}) {
  const logger = await getLogger();
  const { inviteToken, userId, email, displayName, cognitoUsername } = params;

  logger.info({
    email,
    inviteToken,
  }, '[EmployeeManagement] Accepting invitation');

  return prisma.$transaction(async (tx) => {
    // 1. Find all invitations with this token
    const invitations = await tx.invitation.findMany({
      where: {
        inviteToken,
        email: email.toLowerCase(),
        expiresAt: {
          gte: new Date(), // Not expired
        },
      },
      include: {
        account: true,
      },
    });

    if (invitations.length === 0) {
      throw new Error('Invalid or expired invitation');
    }

    // 2. Get the inviter to link the employee
    const inviterId = invitations[0].invitedBy;

    // 3. Create or update the user as an employee
    let employee = await tx.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!employee) {
      employee = await tx.user.create({
        data: {
          id: userId,
          email: email.toLowerCase(),
          displayName: displayName || email.split('@')[0],
          cognitoUsername,
          role: 'EMPLOYEE',
          createdById: inviterId,
        },
      });
    } else if (!employee.cognitoUsername && cognitoUsername) {
      // Update existing user with Cognito username if missing
      employee = await tx.user.update({
        where: { id: employee.id },
        data: { cognitoUsername },
      });
    }

    // 4. Grant access to all invited accounts
    for (const invitation of invitations) {
      await tx.accountMembership.upsert({
        where: {
          accountId_userId: {
            accountId: invitation.accountId,
            userId: employee.id,
          },
        },
        update: {
          roleName: invitation.roleName,
        },
        create: {
          accountId: invitation.accountId,
          userId: employee.id,
          roleName: invitation.roleName,
        },
      });

      // Delete the used invitation
      await tx.invitation.delete({
        where: { id: invitation.id },
      });
    }

    logger.info({
      email,
      userId: employee.id,
      accountIds: invitations.map((i) => i.accountId),
    }, '[EmployeeManagement] Employee invitation accepted');

    return {
      employee,
      accounts: invitations.map((i) => i.account),
    };
  });
}

/**
 * Revokes an invitation
 */
export async function revokeInvitation(inviteToken: string, revokedByUserId: string) {
  const logger = await getLogger();

  return prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findFirst({
      where: { inviteToken },
      include: {
        account: true,
      },
    });

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    // Verify the revoker has permission
    if (invitation.account.primaryOwnerId !== revokedByUserId) {
      const membership = await tx.accountMembership.findUnique({
        where: {
          accountId_userId: {
            accountId: invitation.accountId,
            userId: revokedByUserId,
          },
        },
        include: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      });

      const hasInvitePermission = membership?.role.permissions.some(
        (p) => p.permission === 'INVITES_MANAGE'
      );

      if (!hasInvitePermission) {
        throw new Error('You do not have permission to revoke this invitation');
      }
    }

    // Delete all invitations with this token
    await tx.invitation.deleteMany({
      where: { inviteToken },
    });

    logger.info({
      inviteToken,
      email: invitation.email,
      revokedByUserId,
    }, '[EmployeeManagement] Invitation revoked');

    return { success: true };
  });
}

