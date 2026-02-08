import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CognitoJwtVerifierService, CognitoJwtPayload } from './cognito-jwt-verifier.service';

/**
 * Development-friendly auth guard that:
 * - In production: Requires valid Cognito JWT tokens
 * - In development: Allows requests with mock user data
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(
    private readonly jwtVerifier: CognitoJwtVerifierService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ 
      headers: Record<string, string | undefined>; 
      user?: CognitoJwtPayload 
    }>();

    const isDevelopment = this.configService.get('NODE_ENV') === 'development' || 
                          this.configService.get('NODE_ENV') === 'test';

    // In development, allow requests without auth and inject a mock user
    if (isDevelopment) {
      const authorization = request.headers.authorization ?? request.headers.Authorization;
      
      // If no auth header in dev, inject mock user
      if (!authorization) {
        request.user = {
          sub: 'test-user-id',
          email: 'test@example.com',
          'cognito:username': 'test-user-id',
          email_verified: true,
          token_use: 'id',
          iss: 'local-dev',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          client_id: 'local-dev-client',
        };
        return true;
      }

      // If auth header exists, try to verify it (for testing production-like scenarios)
      try {
        const [scheme, token] = authorization.split(' ');
        if (scheme?.toLowerCase() === 'bearer' && token) {
          const payload = await this.jwtVerifier.verifyToken(token);
          request.user = payload;
          return true;
        }
      } catch (error) {
        // If token verification fails in dev, fall back to mock user
        request.user = {
          sub: 'test-user-id',
          email: 'test@example.com',
          'cognito:username': 'test-user-id',
          email_verified: true,
          token_use: 'id',
          iss: 'local-dev',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          client_id: 'local-dev-client',
        };
        return true;
      }

      return true;
    }

    // Production: Require valid Cognito JWT
    const authorization = request.headers.authorization ?? request.headers.Authorization;

    if (!authorization) {
      throw new UnauthorizedException('Authorization header missing');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Bearer token missing');
    }

    const payload = await this.jwtVerifier.verifyToken(token);
    request.user = payload;

    return true;
  }
}
