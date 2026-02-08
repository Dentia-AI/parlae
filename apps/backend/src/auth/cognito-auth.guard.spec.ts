import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { CognitoAuthGuard } from './cognito-auth.guard';
import { CognitoJwtVerifierService, CognitoJwtPayload } from './cognito-jwt-verifier.service';

describe('CognitoAuthGuard', () => {
  let guard: CognitoAuthGuard;
  let jwtVerifier: jest.Mocked<CognitoJwtVerifierService>;

  beforeEach(async () => {
    const mockJwtVerifier = {
      verifyToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CognitoAuthGuard,
        {
          provide: CognitoJwtVerifierService,
          useValue: mockJwtVerifier,
        },
      ],
    }).compile();

    guard = module.get<CognitoAuthGuard>(CognitoAuthGuard);
    jwtVerifier = module.get(CognitoJwtVerifierService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    const createMockExecutionContext = (headers: Record<string, string | undefined>): ExecutionContext => {
      const mockRequest = { headers };
      return {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as ExecutionContext;
    };

    it('should allow access with valid Bearer token', async () => {
      const mockPayload: CognitoJwtPayload = {
        sub: 'user-123',
        token_use: 'access',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        client_id: 'test-client-id',
        email: 'test@example.com',
        username: 'testuser',
      };

      jwtVerifier.verifyToken.mockResolvedValue(mockPayload);

      const context = createMockExecutionContext({
        authorization: 'Bearer valid-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(jwtVerifier.verifyToken).toHaveBeenCalledWith('valid-token');
      
      const request = context.switchToHttp().getRequest() as any;
      expect(request.user).toEqual(mockPayload);
    });

    it('should allow access with Authorization header (capital A)', async () => {
      const mockPayload: CognitoJwtPayload = {
        sub: 'user-123',
        token_use: 'access',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        client_id: 'test-client-id',
      };

      jwtVerifier.verifyToken.mockResolvedValue(mockPayload);

      const context = createMockExecutionContext({
        Authorization: 'Bearer valid-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(jwtVerifier.verifyToken).toHaveBeenCalledWith('valid-token');
    });

    it('should throw UnauthorizedException if authorization header is missing', async () => {
      const context = createMockExecutionContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Authorization header missing'
      );

      expect(jwtVerifier.verifyToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if Bearer scheme is missing', async () => {
      const context = createMockExecutionContext({
        authorization: 'invalid-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Bearer token missing'
      );

      expect(jwtVerifier.verifyToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if token is missing', async () => {
      const context = createMockExecutionContext({
        authorization: 'Bearer ',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Bearer token missing'
      );

      expect(jwtVerifier.verifyToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if scheme is not Bearer (case insensitive)', async () => {
      const context = createMockExecutionContext({
        authorization: 'Basic token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Bearer token missing'
      );
    });

    it('should accept Bearer with different casing', async () => {
      const mockPayload: CognitoJwtPayload = {
        sub: 'user-123',
        token_use: 'access',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        client_id: 'test-client-id',
      };

      jwtVerifier.verifyToken.mockResolvedValue(mockPayload);

      const context = createMockExecutionContext({
        authorization: 'bearer valid-token',
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(jwtVerifier.verifyToken).toHaveBeenCalledWith('valid-token');
    });

    it('should propagate UnauthorizedException from jwt verifier', async () => {
      jwtVerifier.verifyToken.mockRejectedValue(
        new UnauthorizedException('Invalid token')
      );

      const context = createMockExecutionContext({
        authorization: 'Bearer invalid-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(context)).rejects.toThrow('Invalid token');
    });

    it('should attach user payload to request', async () => {
      const mockPayload: CognitoJwtPayload = {
        sub: 'user-456',
        token_use: 'access',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        client_id: 'test-client-id',
        email: 'user@example.com',
        username: 'testuser456',
      };

      jwtVerifier.verifyToken.mockResolvedValue(mockPayload);

      const mockRequest = { headers: { authorization: 'Bearer token' } };
      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as ExecutionContext;

      await guard.canActivate(context);

      expect((mockRequest as any).user).toEqual(mockPayload);
    });
  });
});

