'use server';

import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { refreshCognitoTokens } from './cognito-helpers';

export interface CognitoTokenSet {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn?: number; // seconds until expiration
}

/**
 * Store Cognito tokens for a user
 * This keeps the JWT small by storing large tokens in the database
 */
export async function storeCognitoTokens(userId: string, tokens: CognitoTokenSet) {
  const logger = await getLogger();

  try {
    // Calculate expiration time (default to 1 hour if not provided)
    const expiresIn = tokens.expiresIn ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await prisma.cognitoTokens.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: tokens.accessToken,
        idToken: tokens.idToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
      },
      update: {
        accessToken: tokens.accessToken,
        idToken: tokens.idToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
      },
    });

    logger.info({ userId }, 'Cognito tokens stored successfully');
  } catch (error) {
    logger.error({ error, userId }, 'Failed to store Cognito tokens');
    throw new Error('Failed to store authentication tokens');
  }
}

/**
 * Retrieve Cognito tokens for a user
 * Automatically refreshes tokens if they're expired or about to expire
 */
export async function getCognitoTokens(userId: string): Promise<CognitoTokenSet | null> {
  const logger = await getLogger();

  try {
    const tokens = await prisma.cognitoTokens.findUnique({
      where: { userId },
    });

    if (!tokens) {
      logger.warn({ userId }, 'No Cognito tokens found for user');
      return null;
    }

    // Add 5-minute buffer to refresh tokens before they expire
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    const isExpired = tokens.expiresAt < new Date();
    const isAboutToExpire = tokens.expiresAt < fiveMinutesFromNow;

    // If tokens are valid and not about to expire, return them
    if (!isExpired && !isAboutToExpire) {
      return {
        accessToken: tokens.accessToken,
        idToken: tokens.idToken,
        refreshToken: tokens.refreshToken || undefined,
      };
    }

    // Try to refresh the tokens
    if (!tokens.refreshToken) {
      logger.warn({ userId }, 'No refresh token available, cannot refresh expired tokens');
      return null;
    }

    logger.info({ userId, isExpired, isAboutToExpire }, 'Attempting to refresh Cognito tokens');

    try {
      // Get user's Cognito username for the refresh request
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { cognitoUsername: true, email: true },
      });

      if (!user) {
        logger.error({ userId }, 'User not found for token refresh');
        return null;
      }

      const username = user.cognitoUsername || user.email;

      if (!username) {
        logger.error({ userId }, 'No username or email found for token refresh');
        return null;
      }

      const clientId = process.env.COGNITO_CLIENT_ID;
      const clientSecret = process.env.COGNITO_CLIENT_SECRET;
      const issuer = process.env.COGNITO_ISSUER;

      if (!clientId || !clientSecret || !issuer) {
        logger.error('Cognito environment variables not configured');
        return null;
      }

      // Refresh the tokens
      const refreshedTokens = await refreshCognitoTokens({
        refreshToken: tokens.refreshToken,
        clientId,
        clientSecret,
        issuer,
        username,
      });

      // Store the new tokens
      await storeCognitoTokens(userId, {
        accessToken: refreshedTokens.accessToken,
        idToken: refreshedTokens.idToken,
        refreshToken: refreshedTokens.refreshToken || tokens.refreshToken, // Reuse old refresh token if new one not provided
        expiresIn: refreshedTokens.expiresIn,
      });

      logger.info({ userId }, 'Successfully refreshed Cognito tokens');

      return {
        accessToken: refreshedTokens.accessToken,
        idToken: refreshedTokens.idToken,
        refreshToken: refreshedTokens.refreshToken || tokens.refreshToken,
      };
    } catch (refreshError) {
      logger.error({ error: refreshError, userId }, 'Failed to refresh Cognito tokens');
      // If refresh fails, return null so the user knows they need to re-login
      return null;
    }
  } catch (error) {
    logger.error({ error, userId }, 'Failed to retrieve Cognito tokens');
    return null;
  }
}

/**
 * Delete Cognito tokens for a user (e.g., on sign out)
 */
export async function deleteCognitoTokens(userId: string) {
  const logger = await getLogger();

  try {
    await prisma.cognitoTokens.delete({
      where: { userId },
    });

    logger.info({ userId }, 'Cognito tokens deleted');
  } catch (error) {
    // It's okay if tokens don't exist
    logger.debug({ error, userId }, 'Failed to delete Cognito tokens (may not exist)');
  }
}

