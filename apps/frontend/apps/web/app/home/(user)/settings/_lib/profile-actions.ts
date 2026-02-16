'use server';

import { prisma } from '@kit/prisma';
import { getSessionUser, getCognitoTokens } from '@kit/shared/auth';

function parseCognitoRegion(issuer: string) {
  const url = new URL(issuer);
  const segments = url.hostname.split('.');
  if (segments.length < 2) {
    throw new Error('Invalid Cognito issuer hostname');
  }
  return segments[1];
}

export async function updateDisplayNameAction(params: { displayName: string }) {
  const user = await getSessionUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const displayName = params.displayName.trim();

  if (!displayName || displayName.length < 1) {
    return { success: false, error: 'Name cannot be empty' };
  }

  if (displayName.length > 100) {
    return { success: false, error: 'Name must be 100 characters or less' };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { displayName },
    });

    // Also update the account name if this is the primary owner
    await prisma.account.updateMany({
      where: {
        primaryOwnerId: user.id,
        isPersonalAccount: true,
      },
      data: { name: displayName },
    });

    return { success: true };
  } catch (error) {
    console.error('[Settings] Failed to update display name:', error);
    return { success: false, error: 'Failed to update name' };
  }
}

export async function updateAccountNameAction(params: { accountId: string; name: string }) {
  const user = await getSessionUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const name = params.name.trim();

  if (!name || name.length < 1) {
    return { success: false, error: 'Name cannot be empty' };
  }

  if (name.length > 100) {
    return { success: false, error: 'Name must be 100 characters or less' };
  }

  try {
    await prisma.account.update({
      where: { id: params.accountId, primaryOwnerId: user.id },
      data: { name },
    });

    return { success: true };
  } catch (error) {
    console.error('[Settings] Failed to update account name:', error);
    return { success: false, error: 'Failed to update account name' };
  }
}

export async function changePasswordAction(params: {
  currentPassword: string;
  newPassword: string;
}) {
  const user = await getSessionUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { currentPassword, newPassword } = params;

  if (!currentPassword || !newPassword) {
    return { success: false, error: 'Both current and new password are required' };
  }

  if (newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters' };
  }

  // In development mode, just validate and return success
  const isDev = process.env.NODE_ENV === 'development' ||
    process.env.NEXTAUTH_URL?.includes('localhost');

  if (isDev) {
    return { success: true };
  }

  // In production, use Cognito's ChangePassword API
  try {
    const tokens = await getCognitoTokens(user.id);

    if (!tokens?.accessToken) {
      return {
        success: false,
        error: 'Session expired. Please sign out and sign back in.',
      };
    }

    const issuer = process.env.COGNITO_ISSUER;

    if (!issuer) {
      return { success: false, error: 'Authentication not configured' };
    }

    const region = parseCognitoRegion(issuer);

    const response = await fetch(
      `https://cognito-idp.${region}.amazonaws.com/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target':
            'AWSCognitoIdentityProviderService.ChangePassword',
          'X-Amz-User-Agent': 'aws-sdk-js/3.x',
        },
        body: JSON.stringify({
          AccessToken: tokens.accessToken,
          PreviousPassword: currentPassword,
          ProposedPassword: newPassword,
        }),
      },
    );

    if (!response.ok) {
      const payload = await response.json();
      const errorType = payload?.__type ?? '';

      if (errorType.includes('NotAuthorized')) {
        return { success: false, error: 'Current password is incorrect' };
      }

      if (errorType.includes('InvalidPassword')) {
        return {
          success: false,
          error:
            'New password does not meet requirements. Use at least 8 characters with uppercase, lowercase, and a number.',
        };
      }

      if (errorType.includes('LimitExceeded')) {
        return {
          success: false,
          error: 'Too many attempts. Please try again later.',
        };
      }

      console.error('[Settings] Cognito ChangePassword failed:', payload);
      return { success: false, error: 'Failed to change password' };
    }

    return { success: true };
  } catch (error) {
    console.error('[Settings] Password change error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
