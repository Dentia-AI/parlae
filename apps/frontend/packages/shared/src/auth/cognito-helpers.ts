import { createHmac } from 'node:crypto';
import { prisma } from '@kit/prisma';

type CognitoAuthResult = {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn?: number; // seconds until token expiration
};

type CognitoAuthResponse = {
  AccessToken?: string;
  IdToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
};

type CognitoUserAttributes = {
  username: string;
  attributes: Record<string, string>;
};

export function parseCognitoRegion(issuer: string) {
  const url = new URL(issuer);
  const segments = url.hostname.split('.');

  if (segments.length < 2) {
    throw new Error('Invalid Cognito issuer hostname');
  }

  return segments[1];
}

export function createSecretHash(clientId: string, clientSecret: string, username: string) {
  const hmac = createHmac('sha256', clientSecret);
  hmac.update(username + clientId);
  return hmac.digest('base64');
}

export async function initiateUserPasswordAuth(params: {
  email: string;
  password: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
}) {
  const { email, password, clientId, clientSecret, issuer } = params;

  // Look up the Cognito username from the database
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { cognitoUsername: true },
  });

  // Use the stored Cognito username if available, otherwise fall back to email
  // (for backwards compatibility with users created before this fix)
  const username = user?.cognitoUsername || email;

  const region = parseCognitoRegion(issuer);
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      'X-Amz-User-Agent': 'aws-sdk-js/3.x',
    },
    body: JSON.stringify({
      ClientId: clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: createSecretHash(clientId, clientSecret, username),
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    const error = payload?.__type ?? 'Unknown';
    const message = payload?.message ?? 'No message provided';
    console.error(JSON.stringify({
      message: '[Auth][Cognito] InitiateAuth failed',
      error,
      errorMessage: message,
      username,
      response: payload,
    }));
    throw new Error(error);
  }

  const authResult = payload?.AuthenticationResult as CognitoAuthResponse;

  if (!authResult?.AccessToken || !authResult?.IdToken) {
    throw new Error('AuthenticationResultMissing');
  }

  const result: CognitoAuthResult = {
    accessToken: authResult.AccessToken,
    idToken: authResult.IdToken,
    expiresIn: authResult.ExpiresIn, // Usually 3600 seconds (1 hour)
  };

  if (authResult.RefreshToken) {
    result.refreshToken = authResult.RefreshToken;
  }

  return result;
}

/**
 * Refresh Cognito tokens using a refresh token
 */
export async function refreshCognitoTokens(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  username: string;
}): Promise<CognitoAuthResult> {
  const { refreshToken, clientId, clientSecret, issuer, username } = params;

  const region = parseCognitoRegion(issuer);
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      'X-Amz-User-Agent': 'aws-sdk-js/3.x',
    },
    body: JSON.stringify({
      ClientId: clientId,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
        SECRET_HASH: createSecretHash(clientId, clientSecret, username),
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    const error = payload?.__type ?? 'Unknown';
    const message = payload?.message ?? 'No message provided';
    console.error(JSON.stringify({
      message: '[Auth][Cognito] Token refresh failed',
      error,
      errorMessage: message,
      username,
      response: payload,
    }));
    throw new Error(error);
  }

  const authResult = payload?.AuthenticationResult as CognitoAuthResponse;

  if (!authResult?.AccessToken || !authResult?.IdToken) {
    throw new Error('AuthenticationResultMissing');
  }

  const result: CognitoAuthResult = {
    accessToken: authResult.AccessToken,
    idToken: authResult.IdToken,
    expiresIn: authResult.ExpiresIn, // Usually 3600 seconds (1 hour)
  };

  // Refresh token response typically doesn't include a new refresh token
  // We reuse the existing one
  if (authResult.RefreshToken) {
    result.refreshToken = authResult.RefreshToken;
  }

  return result;
}

export async function getCognitoUser(params: { accessToken: string; issuer: string }) {
  const { accessToken, issuer } = params;
  const region = parseCognitoRegion(issuer);

  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser',
      'X-Amz-User-Agent': 'aws-sdk-js/3.x',
    },
    body: JSON.stringify({
      AccessToken: accessToken,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    const error = payload?.__type ?? 'Unknown';
    throw new Error(error);
  }

  const username = payload?.Username as string | undefined;
  const userAttributes = Array.isArray(payload?.UserAttributes) ? payload.UserAttributes : [];

  const attributes: Record<string, string> = {};

  for (const attribute of userAttributes) {
    if (attribute?.Name && attribute?.Value) {
      attributes[attribute.Name] = attribute.Value;
    }
  }

  if (!username) {
    throw new Error('CognitoUserMissingUsername');
  }

  const result: CognitoUserAttributes = {
    username,
    attributes,
  };

  return result;
}
