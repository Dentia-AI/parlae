import { NextResponse } from 'next/server';

import { createSecretHash, parseCognitoRegion } from '@kit/shared/auth/cognito-helpers';
import { getLogger } from '@kit/shared/logger';

export async function POST(request: Request) {
  const logger = await getLogger();
  const body = await request.json();
  const { username } = body;

  if (!username) {
    logger.error({}, '[Auth][ResendVerificationAPI] Missing username');
    
    return NextResponse.json(
      {
        error: {
          message: 'Username is required',
        },
      },
      { status: 400 },
    );
  }

  const clientId = process.env.COGNITO_CLIENT_ID;
  const clientSecret = process.env.COGNITO_CLIENT_SECRET;
  const issuer = process.env.COGNITO_ISSUER;

  if (!clientId || !clientSecret || !issuer) {
    logger.error({
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasIssuer: !!issuer,
    }, '[Auth][ResendVerificationAPI] Missing required environment variables');
    
    return NextResponse.json(
      {
        error: {
          message: 'Server configuration error',
        },
      },
      { status: 500 },
    );
  }

  const region = parseCognitoRegion(issuer);

  try {
    const cognitoResponse = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ResendConfirmationCode',
        'X-Amz-User-Agent': 'aws-sdk-js/3.x',
      },
      body: JSON.stringify({
        ClientId: clientId,
        SecretHash: createSecretHash(clientId, clientSecret, username),
        Username: username,
      }),
    });

    const payload = await cognitoResponse.json();

    if (!cognitoResponse.ok) {
      const errorType = (payload as { __type?: string }).__type;
      
      logger.error({
        username,
        cognitoErrorType: errorType,
        cognitoErrorMessage: payload.message,
        status: cognitoResponse.status,
      }, '[Auth][ResendVerificationAPI] Cognito resend failed');

      let errorMessage = 'Failed to resend code. Please try again.';
      
      if (errorType === 'LimitExceededException') {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (errorType === 'UserNotFoundException') {
        errorMessage = 'User not found.';
      }

      return NextResponse.json(
        {
          error: {
            message: errorMessage,
          },
        },
        { status: 400 },
      );
    }

    logger.info({
      username,
    }, '[Auth][ResendVerificationAPI] Verification code resent successfully');

    return NextResponse.json(
      {
        success: true,
        message: 'Verification code resent successfully',
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error({
      username,
      error: error instanceof Error ? error.message : String(error),
    }, '[Auth][ResendVerificationAPI] Resend failed');

    return NextResponse.json(
      {
        error: {
          message: 'Failed to resend code. Please try again.',
        },
      },
      { status: 500 },
    );
  }
}

