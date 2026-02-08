import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { CognitoJwtVerifierService, CognitoJwtPayload } from './cognito-jwt-verifier.service';

@Injectable()
export class CognitoAuthGuard implements CanActivate {
  constructor(private readonly jwtVerifier: CognitoJwtVerifierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: CognitoJwtPayload }>();

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
