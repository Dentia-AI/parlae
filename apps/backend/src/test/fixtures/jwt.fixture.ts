import { createSign, createPublicKey, createPrivateKey, randomBytes } from 'crypto';
import type { CognitoJwtPayload } from '../../auth/cognito-jwt-verifier.service';

/**
 * Generate a test RSA key pair
 */
export function generateKeyPair() {
  const { generateKeyPairSync } = require('crypto');
  
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { publicKey, privateKey };
}

/**
 * Create a valid JWT token for testing
 */
export function createTestJwt(
  payload: Partial<CognitoJwtPayload>,
  privateKey: string,
  kid = 'test-key-id'
): string {
  const now = Math.floor(Date.now() / 1000);
  
  const fullPayload: CognitoJwtPayload = {
    sub: payload.sub || 'test-user-id',
    token_use: 'access',
    iss: payload.iss || 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test123',
    exp: payload.exp || now + 3600,
    iat: payload.iat || now,
    client_id: payload.client_id || 'test-client-id',
    email: payload.email || 'test@example.com',
    username: payload.username || 'testuser',
    ...payload,
  };

  const header = {
    alg: 'RS256',
    kid,
    typ: 'JWT',
  };

  const headerSegment = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadSegment = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signer = createSign('RSA-SHA256');
  signer.update(`${headerSegment}.${payloadSegment}`);
  signer.end();

  const signature = signer.sign(privateKey);
  const signatureSegment = signature.toString('base64url');

  return `${headerSegment}.${payloadSegment}.${signatureSegment}`;
}

/**
 * Create a JWK from a public key
 */
export function createJwkFromPublicKey(publicKey: string, kid = 'test-key-id') {
  const key = createPublicKey(publicKey);
  const jwk = key.export({ format: 'jwk' });

  return {
    kid,
    kty: 'RSA',
    alg: 'RS256',
    use: 'sig',
    n: jwk.n,
    e: jwk.e,
  };
}

/**
 * Mock JWKS response
 */
export function createMockJwksResponse(publicKey: string, kid = 'test-key-id') {
  return {
    keys: [createJwkFromPublicKey(publicKey, kid)],
  };
}

/**
 * Create an expired JWT token
 */
export function createExpiredJwt(privateKey: string, kid = 'test-key-id'): string {
  const now = Math.floor(Date.now() / 1000);
  return createTestJwt(
    {
      exp: now - 3600, // Expired 1 hour ago
    },
    privateKey,
    kid
  );
}

/**
 * Create a malformed JWT token
 */
export function createMalformedJwt(): string {
  return 'invalid.jwt.token';
}

/**
 * Create JWT with wrong issuer
 */
export function createJwtWithWrongIssuer(privateKey: string, kid = 'test-key-id'): string {
  return createTestJwt(
    {
      iss: 'https://wrong-issuer.example.com',
    },
    privateKey,
    kid
  );
}

/**
 * Create JWT with wrong client ID
 */
export function createJwtWithWrongClientId(privateKey: string, kid = 'test-key-id'): string {
  return createTestJwt(
    {
      client_id: 'wrong-client-id',
    },
    privateKey,
    kid
  );
}

/**
 * Create ID token instead of access token
 */
export function createIdToken(privateKey: string, kid = 'test-key-id'): string {
  return createTestJwt(
    {
      token_use: 'id',
    },
    privateKey,
    kid
  );
}

