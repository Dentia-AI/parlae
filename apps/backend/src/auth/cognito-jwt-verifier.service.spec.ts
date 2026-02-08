import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { CognitoJwtVerifierService } from './cognito-jwt-verifier.service';
import { createMockConfigService } from '../test/mocks/config.mock';
import {
  generateKeyPair,
  createTestJwt,
  createMockJwksResponse,
  createExpiredJwt,
  createMalformedJwt,
  createJwtWithWrongIssuer,
  createJwtWithWrongClientId,
  createIdToken,
} from '../test/fixtures/jwt.fixture';

// Mock fetch globally
global.fetch = jest.fn();

describe('CognitoJwtVerifierService', () => {
  let service: CognitoJwtVerifierService;
  let configService: ReturnType<typeof createMockConfigService>;
  let keyPair: { publicKey: string; privateKey: string };

  beforeEach(async () => {
    // Generate a fresh key pair for each test
    keyPair = generateKeyPair();

    // Clear all mocks before each test
    jest.clearAllMocks();
    jest.resetAllMocks();

    configService = createMockConfigService({
      COGNITO_USER_POOL_ID: 'us-east-1_test123',
      COGNITO_CLIENT_ID: 'test-client-id',
      AWS_REGION: 'us-east-1',
      COGNITO_ISSUER: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test123',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CognitoJwtVerifierService,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<CognitoJwtVerifierService>(CognitoJwtVerifierService);

    // Mock fetch to return JWKS
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => createMockJwksResponse(keyPair.publicKey, 'test-key-id'),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should initialize with COGNITO_ISSUER from env', () => {
      expect(service).toBeDefined();
      expect(configService.get).toHaveBeenCalledWith('COGNITO_ISSUER');
    });

    it('should construct issuer from region and user pool ID if COGNITO_ISSUER not set', async () => {
      const customConfig = createMockConfigService({
        COGNITO_USER_POOL_ID: 'us-west-2_abc123',
        COGNITO_CLIENT_ID: 'test-client-id',
        AWS_REGION: 'us-west-2',
        COGNITO_ISSUER: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CognitoJwtVerifierService,
          {
            provide: ConfigService,
            useValue: customConfig,
          },
        ],
      }).compile();

      const testService = module.get<CognitoJwtVerifierService>(CognitoJwtVerifierService);
      expect(testService).toBeDefined();
    });

    it('should throw error if COGNITO_CLIENT_ID is not configured', async () => {
      const customConfig = createMockConfigService({
        COGNITO_USER_POOL_ID: 'us-east-1_test123',
        COGNITO_CLIENT_ID: undefined,
        AWS_REGION: 'us-east-1',
      });

      await expect(
        Test.createTestingModule({
          providers: [
            CognitoJwtVerifierService,
            {
              provide: ConfigService,
              useValue: customConfig,
            },
          ],
        }).compile(),
      ).rejects.toThrow('COGNITO_CLIENT_ID is not configured');
    });

    it('should throw error if issuer cannot be determined', async () => {
      const customConfig = createMockConfigService({
        COGNITO_USER_POOL_ID: undefined,
        COGNITO_CLIENT_ID: 'test-client-id',
        AWS_REGION: undefined,
        COGNITO_ISSUER: undefined,
      });

      await expect(
        Test.createTestingModule({
          providers: [
            CognitoJwtVerifierService,
            {
              provide: ConfigService,
              useValue: customConfig,
            },
          ],
        }).compile(),
      ).rejects.toThrow('Cognito issuer is not configured');
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid JWT token', async () => {
      const token = createTestJwt(
        {
          sub: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
        },
        keyPair.privateKey,
        'test-key-id'
      );

      const payload = await service.verifyToken(token);

      expect(payload).toBeDefined();
      expect(payload.sub).toBe('user-123');
      expect(payload.email).toBe('test@example.com');
      expect(payload.username).toBe('testuser');
      expect(payload.token_use).toBe('access');
    });

    it('should throw UnauthorizedException for malformed token', async () => {
      const token = createMalformedJwt();

      await expect(service.verifyToken(token)).rejects.toThrow();
    });

    it('should throw UnauthorizedException for token without kid in header', async () => {
      const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';

      await expect(service.verifyToken(token)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException for expired token', async () => {
      const token = createExpiredJwt(keyPair.privateKey, 'test-key-id');

      await expect(service.verifyToken(token)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(service.verifyToken(token)).rejects.toThrow(
        'Token has expired'
      );
    });

    it('should throw UnauthorizedException for wrong issuer', async () => {
      const token = createJwtWithWrongIssuer(keyPair.privateKey, 'test-key-id');

      await expect(service.verifyToken(token)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(service.verifyToken(token)).rejects.toThrow(
        'Invalid token issuer'
      );
    });

    it('should throw UnauthorizedException for wrong client ID', async () => {
      const token = createJwtWithWrongClientId(keyPair.privateKey, 'test-key-id');

      await expect(service.verifyToken(token)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(service.verifyToken(token)).rejects.toThrow(
        'Invalid token audience'
      );
    });

    it('should throw UnauthorizedException for ID token instead of access token', async () => {
      const token = createIdToken(keyPair.privateKey, 'test-key-id');

      await expect(service.verifyToken(token)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(service.verifyToken(token)).rejects.toThrow(
        'Token is not an access token'
      );
    });

    it('should throw UnauthorizedException for invalid signature', async () => {
      const token = createTestJwt(
        {
          sub: 'user-123',
          email: 'test@example.com',
        },
        keyPair.privateKey,
        'test-key-id'
      );

      // Tamper with the token
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.invalidsignature`;

      await expect(service.verifyToken(tamperedToken)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should cache and reuse JWKS', async () => {
      const token1 = createTestJwt(
        { sub: 'user-1' },
        keyPair.privateKey,
        'test-key-id'
      );
      const token2 = createTestJwt(
        { sub: 'user-2' },
        keyPair.privateKey,
        'test-key-id'
      );

      await service.verifyToken(token1);
      await service.verifyToken(token2);

      // Should only fetch JWKS once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle JWKS fetch failure', async () => {
      // Reset the mock and set it to fail
      (global.fetch as jest.Mock).mockReset();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      // Create a new service instance to avoid cached JWKS
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CognitoJwtVerifierService,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const freshService = module.get<CognitoJwtVerifierService>(CognitoJwtVerifierService);

      const token = createTestJwt(
        { sub: 'user-123' },
        keyPair.privateKey,
        'test-key-id'
      );

      await expect(freshService.verifyToken(token)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(freshService.verifyToken(token)).rejects.toThrow(
        'Unable to fetch Cognito JWKS'
      );
    });

    it('should handle invalid JWKS response', async () => {
      // Reset the mock and set it to return invalid response
      (global.fetch as jest.Mock).mockReset();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ invalid: 'response' }),
      });

      // Create a new service instance to avoid cached JWKS
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CognitoJwtVerifierService,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const freshService = module.get<CognitoJwtVerifierService>(CognitoJwtVerifierService);

      const token = createTestJwt(
        { sub: 'user-123' },
        keyPair.privateKey,
        'test-key-id'
      );

      await expect(freshService.verifyToken(token)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(freshService.verifyToken(token)).rejects.toThrow(
        'Invalid JWKS response from Cognito'
      );
    });

    it('should handle missing signing key', async () => {
      const token = createTestJwt(
        { sub: 'user-123' },
        keyPair.privateKey,
        'different-key-id' // Different kid that's not in JWKS
      );

      await expect(service.verifyToken(token)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });
});

