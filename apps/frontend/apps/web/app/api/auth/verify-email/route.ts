import { NextResponse } from 'next/server';

import { createSecretHash, parseCognitoRegion } from '@kit/shared/auth/cognito-helpers';
import { getLogger } from '@kit/shared/logger';

export async function POST(request: Request) {
  const logger = await getLogger();
  const body = await request.json();
  const { username, code } = body;

  if (!username || !code) {
    logger.error({ username: !!username, code: !!code }, '[Auth][VerifyEmailAPI] Missing required fields');
    
    return NextResponse.json(
      {
        error: {
          message: 'Username and code are required',
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
    }, '[Auth][VerifyEmailAPI] Missing required environment variables');
    
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
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmSignUp',
        'X-Amz-User-Agent': 'aws-sdk-js/3.x',
      },
      body: JSON.stringify({
        ClientId: clientId,
        SecretHash: createSecretHash(clientId, clientSecret, username),
        Username: username,
        ConfirmationCode: code,
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
      }, '[Auth][VerifyEmailAPI] Cognito confirmation failed');

      let errorMessage = 'Verification failed. Please try again.';
      
      if (errorType === 'CodeMismatchException') {
        errorMessage = 'Invalid verification code. Please check and try again.';
      } else if (errorType === 'ExpiredCodeException') {
        errorMessage = 'Verification code expired. Please request a new one.';
      } else if (errorType === 'NotAuthorizedException') {
        errorMessage = 'User is already confirmed or verification failed.';
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
    }, '[Auth][VerifyEmailAPI] Email verified successfully');

    return NextResponse.json(
      {
        success: true,
        message: 'Email verified successfully',
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error({
      username,
      error: error instanceof Error ? error.message : String(error),
    }, '[Auth][VerifyEmailAPI] Verification failed');

    return NextResponse.json(
      {
        error: {
          message: 'Verification failed. Please try again.',
        },
      },
      { status: 500 },
    );
  }
}

