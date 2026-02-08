import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { PrismaService } from './prisma/prisma.service';
import { CognitoAuthGuard } from './auth/cognito-auth.guard';
import { CognitoJwtVerifierService, CognitoJwtPayload } from './auth/cognito-jwt-verifier.service';
import { ConfigService } from '@nestjs/config';
import { createMockPrismaService } from './test/mocks/prisma.mock';
import { createMockConfigService } from './test/mocks/config.mock';
import { createMockUser, createMockAccount } from './test/fixtures/user.fixture';

describe('AppController', () => {
  let controller: AppController;
  let prismaService: any;

  beforeEach(async () => {
    const mockPrismaService = createMockPrismaService();
    const mockConfigService = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        CognitoJwtVerifierService,
        CognitoAuthGuard,
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    prismaService = module.get(PrismaService);

    // Mock fetch for JWT verification
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [] }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('status', () => {
    it('should return status with reachable database', async () => {
      prismaService.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      const result = await controller.status();

      expect(result).toHaveProperty('message', 'Dentia backend ready');
      expect(result).toHaveProperty('database', 'reachable');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('string');
      expect(prismaService.$queryRaw).toHaveBeenCalled();
    });

    it('should return status with unreachable database', async () => {
      const dbError = new Error('Connection failed');
      prismaService.$queryRaw.mockRejectedValue(dbError);

      const result = await controller.status();

      expect(result).toHaveProperty('message', 'Dentia backend ready');
      expect(result.database).toContain('unreachable');
      expect(result.database).toContain('Connection failed');
      expect(result).toHaveProperty('timestamp');
    });

    it('should handle non-Error database exceptions', async () => {
      prismaService.$queryRaw.mockRejectedValue('string error');

      const result = await controller.status();

      expect(result).toHaveProperty('message', 'Dentia backend ready');
      expect(result.database).toContain('unreachable');
      expect(result.database).toContain('string error');
    });

    it('should return valid ISO timestamp', async () => {
      prismaService.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      const result = await controller.status();

      const timestamp = new Date(result.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toISOString()).toBe(result.timestamp);
    });
  });

  describe('me', () => {
    it('should return user from request', () => {
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

      const mockRequest = {
        user: mockPayload,
      } as any;

      const result = controller.me(mockRequest);

      expect(result).toEqual({
        user: mockPayload,
      });
    });

    it('should handle request without user', () => {
      const mockRequest = {} as any;

      const result = controller.me(mockRequest);

      expect(result).toEqual({
        user: undefined,
      });
    });
  });

  describe('echo', () => {
    it('should echo message back with metadata', () => {
      const body = {
        message: 'Hello, backend!',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const result = controller.echo(body);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('echo', 'Hello, backend!');
      expect(result).toHaveProperty('receivedAt');
      expect(result).toHaveProperty('sentAt', '2024-01-01T00:00:00.000Z');
      expect(result).toHaveProperty('backend', 'NestJS');
      expect(typeof result.receivedAt).toBe('string');
    });

    it('should handle message without timestamp', () => {
      const body = {
        message: 'Test message',
      };

      const result = controller.echo(body);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('echo', 'Test message');
      expect(result).toHaveProperty('receivedAt');
      expect(result).toHaveProperty('sentAt', undefined);
      expect(result).toHaveProperty('backend', 'NestJS');
    });

    it('should return valid ISO timestamp for receivedAt', () => {
      const body = { message: 'test' };
      const before = Date.now();
      const result = controller.echo(body);
      const after = Date.now();

      const receivedTime = new Date(result.receivedAt).getTime();
      expect(receivedTime).toBeGreaterThanOrEqual(before);
      expect(receivedTime).toBeLessThanOrEqual(after);
    });
  });

  describe('testDatabase', () => {
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

    it('should return successful database test with user data', async () => {
      const mockUser = createMockUser({ id: 'user-123' });

      prismaService.user.count.mockResolvedValue(10);
      prismaService.account.count.mockResolvedValue(5);
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      const mockRequest = { user: mockPayload } as any;
      const result = await controller.testDatabase(mockRequest);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('database', 'connected');
      expect(result).toHaveProperty('authenticated', true);
      expect(result.user).toHaveProperty('cognitoId', 'user-123');
      expect(result.user).toHaveProperty('email', 'test@example.com');
      expect(result.user).toHaveProperty('dbRecord', mockUser);
      expect(result.stats).toEqual({
        totalUsers: 10,
        totalAccounts: 5,
      });
      expect(result).toHaveProperty('timestamp');
    });

    it('should handle user not found in database', async () => {
      prismaService.user.count.mockResolvedValue(10);
      prismaService.account.count.mockResolvedValue(5);
      prismaService.user.findUnique.mockResolvedValue(null);

      const mockRequest = { user: mockPayload } as any;
      const result = await controller.testDatabase(mockRequest);

      expect(result).toHaveProperty('success', true);
      expect(result.user).toHaveProperty('dbRecord', null);
      expect(result.stats).toEqual({
        totalUsers: 10,
        totalAccounts: 5,
      });
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      prismaService.user.count.mockRejectedValue(dbError);

      const mockRequest = { user: mockPayload } as any;
      const result = await controller.testDatabase(mockRequest);

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('database', 'error');
      expect(result).toHaveProperty('error', 'Database connection failed');
      expect(result).toHaveProperty('timestamp');
    });

    it('should handle non-Error database exceptions', async () => {
      prismaService.user.count.mockRejectedValue('string error');

      const mockRequest = { user: mockPayload } as any;
      const result = await controller.testDatabase(mockRequest);

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('database', 'error');
      expect(result).toHaveProperty('error', 'Unknown error');
    });

    it('should call all database operations', async () => {
      const mockUser = createMockUser();

      prismaService.user.count.mockResolvedValue(10);
      prismaService.account.count.mockResolvedValue(5);
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      const mockRequest = { user: mockPayload } as any;
      await controller.testDatabase(mockRequest);

      expect(prismaService.user.count).toHaveBeenCalled();
      expect(prismaService.account.count).toHaveBeenCalled();
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { id: true, email: true, displayName: true, role: true },
      });
    });

    it('should return valid ISO timestamp', async () => {
      prismaService.user.count.mockResolvedValue(0);
      prismaService.account.count.mockResolvedValue(0);
      prismaService.user.findUnique.mockResolvedValue(null);

      const mockRequest = { user: mockPayload } as any;
      const result = await controller.testDatabase(mockRequest);

      const timestamp = new Date(result.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toISOString()).toBe(result.timestamp);
    });
  });
});

