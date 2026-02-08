'use server';

import { revalidatePath } from 'next/cache';
import { getLogger } from '@kit/shared/logger';
import { inviteEmployee, acceptInvitation, revokeInvitation } from './invite-employee';
import { InviteEmployeeSchema, INVITE_EMPLOYEE_ERROR_KEYS } from './invite-employee.schema';

/**
 * Server action to invite an employee
 * Must be called by an account manager with appropriate permissions
 */
export async function inviteEmployeeAction(data: unknown, userId: string) {
  const logger = await getLogger();

  try {
    // Validate input
    const parsed = InviteEmployeeSchema.safeParse(data);

    if (!parsed.success) {
      logger.error({
        errors: parsed.error.flatten(),
      }, '[ServerAction] Invite employee validation failed');

      return {
        success: false,
        error: INVITE_EMPLOYEE_ERROR_KEYS.GENERIC,
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { email, displayName, accountIds, roleName } = parsed.data;

    // Invite the employee
    const result = await inviteEmployee({
      email,
      displayName,
      accountIds,
      roleName,
      invitedByUserId: userId,
    });

    // TODO: Send invitation email
    // await sendInvitationEmail({
    //   to: email,
    //   inviteToken: result.inviteToken,
    //   inviterName: 'Account Manager',
    // });

    logger.info({
      email,
      accountIds,
      isNewInvite: result.isNewInvite,
    }, '[ServerAction] Employee invited successfully');

    // Revalidate relevant pages
    revalidatePath('/home');
    revalidatePath('/employees');

    return {
      success: true,
      data: {
        email,
        isNewInvite: result.isNewInvite,
        inviteToken: 'inviteToken' in result ? result.inviteToken : undefined,
      },
    };
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[ServerAction] Failed to invite employee');

    return {
      success: false,
      error: error instanceof Error ? error.message : INVITE_EMPLOYEE_ERROR_KEYS.GENERIC,
    };
  }
}

/**
 * Server action to accept an invitation (called during employee signup)
 */
export async function acceptInvitationAction(params: {
  inviteToken: string;
  userId: string;
  email: string;
  displayName?: string;
}) {
  const logger = await getLogger();

  try {
    const result = await acceptInvitation(params);

    logger.info({
      email: params.email,
      userId: params.userId,
      accountCount: result.accounts.length,
    }, '[ServerAction] Invitation accepted successfully');

    // Revalidate
    revalidatePath('/home');

    return {
      success: true,
      data: {
        employee: result.employee,
        accounts: result.accounts,
      },
    };
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
      inviteToken: params.inviteToken,
    }, '[ServerAction] Failed to accept invitation');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept invitation',
    };
  }
}

/**
 * Server action to revoke an invitation
 */
export async function revokeInvitationAction(inviteToken: string, userId: string) {
  const logger = await getLogger();

  try {
    await revokeInvitation(inviteToken, userId);

    logger.info({
      inviteToken,
      userId,
    }, '[ServerAction] Invitation revoked successfully');

    // Revalidate
    revalidatePath('/home');
    revalidatePath('/employees');

    return {
      success: true,
    };
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
      inviteToken,
    }, '[ServerAction] Failed to revoke invitation');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to revoke invitation',
    };
  }
}

