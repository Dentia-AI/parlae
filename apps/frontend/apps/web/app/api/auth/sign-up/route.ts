import { NextResponse } from 'next/server';

import { ensureUserProvisioned } from '@kit/shared/auth';
import { createSecretHash, parseCognitoRegion } from '@kit/shared/auth/cognito-helpers';
import { acceptInvitation } from '@kit/shared/employee-management';
import { createGoHighLevelService } from '@kit/shared/gohighlevel/server';
import { getLogger } from '@kit/shared/logger';

import { SignUpSchema, SIGN_UP_ERROR_KEYS } from '~/auth/sign-up/_lib/sign-up.schema';

type CognitoErrorResponse = {
  __type?: string;
  message?: string;
};

function mapCognitoError(error: CognitoErrorResponse) {
  const errorType = error.__type?.split('#').pop();

  switch (errorType) {
    case 'UsernameExistsException':
      return {
        status: 409,
        field: 'email',
        message: 'auth:errors.userAlreadyExists',
      };
    case 'InvalidPasswordException':
      return {
        status: 400,
        field: 'password',
        message: SIGN_UP_ERROR_KEYS.GENERIC,
      };
    case 'InvalidParameterException':
      return {
        status: 400,
        message: SIGN_UP_ERROR_KEYS.GENERIC,
      };
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return {
        status: 429,
        message: SIGN_UP_ERROR_KEYS.GENERIC,
      };
    default:
      return {
        status: 400,
        message: SIGN_UP_ERROR_KEYS.GENERIC,
      };
  }
}

export async function POST(request: Request) {
  const logger = await getLogger();
  const body = await request.json();
  const parsed = SignUpSchema.safeParse(body);
  
  // Extract hostname for domain-based tagging
  const hostname = request.headers.get('host') || '';

  if (!parsed.success) {
    logger.error({
      errors: parsed.error.flatten(),
      body: { ...body, password: '[REDACTED]', confirmPassword: '[REDACTED]' },
    }, '[Auth][SignUpAPI] Schema validation failed');
    
    return NextResponse.json(
      {
        errors: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { fullName, email, password, inviteToken } = parsed.data;

  const clientId = process.env.COGNITO_CLIENT_ID;
  const clientSecret = process.env.COGNITO_CLIENT_SECRET;
  const issuer = process.env.COGNITO_ISSUER;

  if (!clientId || !clientSecret || !issuer) {
    logger.error({
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasIssuer: !!issuer,
    }, '[Auth][SignUpAPI] Missing required environment variables');
    
    return NextResponse.json(
      {
        error: {
          message: SIGN_UP_ERROR_KEYS.GENERIC,
        },
      },
      { status: 500 },
    );
  }

  const region = parseCognitoRegion(issuer);

  try {
    // Generate unique username since email is used as alias
    const username = email.split('@')[0] + '_' + Date.now();
    
    const cognitoResponse = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
        'X-Amz-User-Agent': 'aws-sdk-js/3.x',
      },
      body: JSON.stringify({
        ClientId: clientId,
        SecretHash: createSecretHash(clientId, clientSecret, username),
        Username: username,
        Password: password,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'name', Value: fullName },
        ],
      }),
    });

    const payload = (await cognitoResponse.json()) as CognitoErrorResponse & {
      UserConfirmed?: boolean;
      UserSub?: string;
    };

    if (!cognitoResponse.ok) {
      const mapped = mapCognitoError(payload);

      logger.error({
        email,
        cognitoErrorType: payload.__type,
        cognitoErrorMessage: payload.message,
        mappedError: mapped,
        status: cognitoResponse.status,
      }, '[Auth][SignUpAPI] Cognito signup failed');

      return NextResponse.json(
        {
          error: mapped,
        },
        { status: mapped.status },
      );
    }

    if (!payload.UserSub) {
      logger.error({
        email,
        payload: { ...payload, UserSub: undefined },
      }, '[Auth][SignUpAPI] Cognito did not return UserSub');
      
      return NextResponse.json(
        {
          error: {
            message: SIGN_UP_ERROR_KEYS.GENERIC,
          },
        },
        { status: 500 },
      );
    }

    // Check if this is an employee signup via invitation
    if (inviteToken) {
      // Employee signup - accept the invitation
      try {
        const invitationResult = await acceptInvitation({
          inviteToken,
          userId: payload.UserSub,
          email,
          displayName: fullName,
          cognitoUsername: username,
        });

        logger.info({
          email,
          userId: payload.UserSub,
          accountCount: invitationResult.accounts.length,
          requiresConfirmation: !payload.UserConfirmed,
        }, '[Auth][SignUpAPI] Employee registered via invitation');

        // Sync to GoHighLevel (non-blocking, graceful failure)
        const ghlService = createGoHighLevelService();
        
        if (ghlService.isEnabled()) {
          // Fire and forget - sync in background
          ghlService.syncRegisteredUser({
            email,
            displayName: fullName,
            hostname,
          }).catch((error) => {
            // Log error but don't fail signup
            logger.error({
              error: error instanceof Error ? {
                name: error.name,
                message: error.message,
              } : error,
              email,
            }, '[Auth][SignUpAPI] GoHighLevel sync failed for employee (non-critical)');
          });
        }

        return NextResponse.json(
          {
            success: true,
            requiresConfirmation: !payload.UserConfirmed,
            isEmployee: true,
            accounts: invitationResult.accounts,
          },
          { status: 201 },
        );
      } catch (inviteError) {
        logger.error({
          error: inviteError instanceof Error ? {
            name: inviteError.name,
            message: inviteError.message,
            stack: inviteError.stack,
          } : inviteError,
          email,
          inviteToken,
        }, '[Auth][SignUpAPI] Failed to accept invitation');

        return NextResponse.json(
          {
            error: {
              status: 400,
              message: inviteError instanceof Error ? inviteError.message : 'Invalid or expired invitation',
            },
          },
          { status: 400 },
        );
      }
    }

    // Regular account manager signup
    await ensureUserProvisioned({
      userId: payload.UserSub,
      email,
      displayName: fullName,
      cognitoUsername: username,
    });

    logger.info({
      email,
      userId: payload.UserSub,
      requiresConfirmation: !payload.UserConfirmed,
    }, '[Auth][SignUpAPI] Account manager registered successfully');

    // Sync to GoHighLevel (non-blocking, graceful failure)
    // We don't await this to avoid blocking the signup response
    const ghlService = createGoHighLevelService();
    
    if (ghlService.isEnabled()) {
      // Fire and forget - sync in background
      ghlService.syncRegisteredUser({
        email,
        displayName: fullName,
        hostname,
      }).catch((error) => {
        // Log error but don't fail signup
        logger.error({
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
          } : error,
          email,
        }, '[Auth][SignUpAPI] GoHighLevel sync failed (non-critical)');
      });
    }

    return NextResponse.json(
      {
        success: true,
        requiresConfirmation: !payload.UserConfirmed,
        isEmployee: false,
        username,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
      email,
    }, '[Auth][SignUpAPI] Failed to register user');

    return NextResponse.json(
      {
        error: {
          status: 500,
          message: SIGN_UP_ERROR_KEYS.GENERIC,
        },
      },
      { status: 500 },
    );
  }
}
