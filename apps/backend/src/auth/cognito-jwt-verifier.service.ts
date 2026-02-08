import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, createVerify } from 'crypto';

interface Jwk {
  kid: string;
  kty: string;
  e: string;
  n: string;
  alg: string;
  use: string;
}

export interface CognitoJwtPayload {
  sub: string;
  event_id?: string;
  token_use: string;
  scope?: string;
  auth_time?: number;
  iss: string;
  exp: number;
  iat: number;
  jti?: string;
  username?: string;
  client_id: string;
  email?: string;
  [key: string]: unknown;
}

@Injectable()
export class CognitoJwtVerifierService {
  private readonly issuer: string;
  private readonly clientId: string;
  private readonly cacheTtlMs = 60 * 60 * 1000; // 1 hour
  private jwksCache: Map<string, { pem: string; expiresAt: number }> = new Map();
  private lastJwkFetch = 0;

  constructor(private readonly configService: ConfigService) {
    const issuerEnv = this.configService.get<string>('COGNITO_ISSUER');
    const userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
    const region = this.configService.get<string>('AWS_REGION');

    if (issuerEnv) {
      this.issuer = issuerEnv;
    } else if (region && userPoolId) {
      this.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    } else {
      throw new Error('Cognito issuer is not configured');
    }

    const clientId = this.configService.get<string>('COGNITO_CLIENT_ID');

    if (!clientId) {
      throw new Error('COGNITO_CLIENT_ID is not configured');
    }

    this.clientId = clientId;
  }

  async verifyToken(token: string): Promise<CognitoJwtPayload> {
    const [headerSegment, payloadSegment, signatureSegment] = token.split('.');

    if (!headerSegment || !payloadSegment || !signatureSegment) {
      throw new UnauthorizedException('Malformed JWT token');
    }

    const header = JSON.parse(Buffer.from(headerSegment, 'base64url').toString('utf8')) as { kid?: string };
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as CognitoJwtPayload;

    if (!header.kid) {
      throw new UnauthorizedException('JWT header missing key ID');
    }

    await this.ensureJwkCached(header.kid);

    const cacheEntry = this.jwksCache.get(header.kid);

    if (!cacheEntry) {
      throw new UnauthorizedException('JWT signing key not found');
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerSegment}.${payloadSegment}`);
    verifier.end();

    const signature = Buffer.from(signatureSegment, 'base64url');

    if (!verifier.verify(cacheEntry.pem, signature)) {
      throw new UnauthorizedException('Invalid JWT signature');
    }

    if (payload.iss !== this.issuer) {
      throw new UnauthorizedException('Invalid token issuer');
    }

    if (payload.client_id !== this.clientId) {
      throw new UnauthorizedException('Invalid token audience');
    }

    if (payload.token_use !== 'access') {
      throw new UnauthorizedException('Token is not an access token');
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);

    if (payload.exp <= nowInSeconds) {
      throw new UnauthorizedException('Token has expired');
    }

    return payload;
  }

  private async ensureJwkCached(kid: string) {
    const cacheEntry = this.jwksCache.get(kid);
    const now = Date.now();

    if (cacheEntry && cacheEntry.expiresAt > now) {
      return;
    }

    if (now - this.lastJwkFetch < 5_000 && !cacheEntry) {
      // avoid refetching aggressively if key still missing
      throw new UnauthorizedException('JWT signing keys not yet available');
    }

    await this.refreshJwks();
  }

  private async refreshJwks() {
    const jwksUrl = `${this.issuer}/.well-known/jwks.json`;
    const response = await fetch(jwksUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException(`Unable to fetch Cognito JWKS (${response.status})`);
    }

    const { keys } = (await response.json()) as { keys: Jwk[] };

    if (!Array.isArray(keys)) {
      throw new UnauthorizedException('Invalid JWKS response from Cognito');
    }

    const newCache = new Map<string, { pem: string; expiresAt: number }>();

    for (const jwk of keys) {
      if (!jwk.kid || jwk.kty !== 'RSA') {
        continue;
      }

      const publicKeyObject = createPublicKey({
        key: {
          kty: 'RSA',
          n: jwk.n,
          e: jwk.e,
        },
        format: 'jwk',
      });

      const pem = publicKeyObject.export({ format: 'pem', type: 'spki' }).toString();

      newCache.set(jwk.kid, {
        pem,
        expiresAt: Date.now() + this.cacheTtlMs,
      });
    }

    this.jwksCache = newCache;
    this.lastJwkFetch = Date.now();
  }
}
