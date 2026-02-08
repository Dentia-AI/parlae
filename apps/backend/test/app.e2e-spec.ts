import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CognitoJwtVerifierService } from '../src/auth/cognito-jwt-verifier.service';
import { ConfigService } from '@nestjs/config';
import { generateKeyPair, createTestJwt, createMockJwksResponse } from '../src/test/fixtures/jwt.fixture';

// Mock fetch globally for JWT verification
global.fetch = jest.fn();

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let keyPair: { publicKey: string; privateKey: string };

  beforeAll(async () => {
    // Generate key pair for JWT testing
    keyPair = generateKeyPair();

    // Mock fetch to return JWKS
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => createMockJwksResponse(keyPair.publicKey, 'test-key-id'),
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key: string) => {
          const config: Record<string, any> = {
            COGNITO_USER_POOL_ID: 'us-east-1_test123',
            COGNITO_CLIENT_ID: 'test-client-id',
            AWS_REGION: 'us-east-1',
            COGNITO_ISSUER: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test123',
            DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
            NODE_ENV: 'test',
          };
          return config[key];
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    
    // Add global pipes and filters as in production
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('/ (GET)', () => {
    it('should return status information', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message', 'Dentia backend ready');
          expect(res.body).toHaveProperty('database');
          expect(res.body).toHaveProperty('timestamp');
          expect(typeof res.body.timestamp).toBe('string');
        });
    });

    it('should return valid ISO timestamp', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect((res) => {
          const timestamp = new Date(res.body.timestamp);
          expect(timestamp).toBeInstanceOf(Date);
          expect(timestamp.toISOString()).toBe(res.body.timestamp);
        });
    });
  });

  describe('/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', 'ok');
          expect(res.body).toHaveProperty('timestamp');
        });
    });
  });

  describe('/test/echo (POST)', () => {
    it('should echo message back', () => {
      const message = 'Hello, backend!';
      const timestamp = new Date().toISOString();

      return request(app.getHttpServer())
        .post('/test/echo')
        .send({ message, timestamp })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('echo', message);
          expect(res.body).toHaveProperty('receivedAt');
          expect(res.body).toHaveProperty('sentAt', timestamp);
          expect(res.body).toHaveProperty('backend', 'NestJS');
        });
    });

    it('should handle message without timestamp', () => {
      return request(app.getHttpServer())
        .post('/test/echo')
        .send({ message: 'Test' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('echo', 'Test');
          expect(res.body).toHaveProperty('receivedAt');
        });
    });

    it('should return valid ISO timestamp for receivedAt', () => {
      return request(app.getHttpServer())
        .post('/test/echo')
        .send({ message: 'Test' })
        .expect(201)
        .expect((res) => {
          const receivedAt = new Date(res.body.receivedAt);
          expect(receivedAt).toBeInstanceOf(Date);
          expect(receivedAt.toISOString()).toBe(res.body.receivedAt);
        });
    });
  });

  describe('/me (GET)', () => {
    it('should return 401 without authorization', () => {
      return request(app.getHttpServer())
        .get('/me')
        .expect(401)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 401);
          expect(res.body).toHaveProperty('message', 'Authorization header missing');
        });
    });

    it('should return 401 with invalid token', () => {
      return request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return user info with valid token', async () => {
      const token = createTestJwt(
        {
          sub: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
        },
        keyPair.privateKey,
        'test-key-id'
      );

      return request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('user');
          expect(res.body.user).toHaveProperty('sub', 'user-123');
          expect(res.body.user).toHaveProperty('email', 'test@example.com');
          expect(res.body.user).toHaveProperty('username', 'testuser');
        });
    });

    it('should accept Authorization header with capital A', async () => {
      const token = createTestJwt(
        {
          sub: 'user-123',
          email: 'test@example.com',
        },
        keyPair.privateKey,
        'test-key-id'
      );

      return request(app.getHttpServer())
        .get('/me')
        .set('authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('/test/db (POST)', () => {
    it('should return 401 without authorization', () => {
      return request(app.getHttpServer())
        .post('/test/db')
        .expect(401)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 401);
        });
    });

    it('should test database connection with valid token', async () => {
      const token = createTestJwt(
        {
          sub: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
        },
        keyPair.privateKey,
        'test-key-id'
      );

      // Mock Prisma methods
      jest.spyOn(prismaService.user, 'count').mockResolvedValue(10);
      jest.spyOn(prismaService.account, 'count').mockResolvedValue(5);
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      return request(app.getHttpServer())
        .post('/test/db')
        .set('Authorization', `Bearer ${token}`)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('database', 'connected');
          expect(res.body).toHaveProperty('authenticated', true);
          expect(res.body).toHaveProperty('user');
          expect(res.body.user).toHaveProperty('cognitoId', 'user-123');
          expect(res.body.user).toHaveProperty('email', 'test@example.com');
          expect(res.body).toHaveProperty('stats');
          expect(res.body.stats).toHaveProperty('totalUsers');
          expect(res.body.stats).toHaveProperty('totalAccounts');
        });
    });

    it('should handle database errors gracefully', async () => {
      const token = createTestJwt(
        {
          sub: 'user-123',
          email: 'test@example.com',
        },
        keyPair.privateKey,
        'test-key-id'
      );

      jest.spyOn(prismaService.user, 'count').mockRejectedValue(new Error('Database error'));

      return request(app.getHttpServer())
        .post('/test/db')
        .set('Authorization', `Bearer ${token}`)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', false);
          expect(res.body).toHaveProperty('database', 'error');
          expect(res.body).toHaveProperty('error');
        });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent routes', () => {
      return request(app.getHttpServer())
        .get('/non-existent-route')
        .expect(404)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 404);
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path');
        });
    });

    it('should return proper error structure', () => {
      return request(app.getHttpServer())
        .get('/non-existent')
        .expect(404)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path');
          
          const timestamp = new Date(res.body.timestamp);
          expect(timestamp).toBeInstanceOf(Date);
        });
    });
  });

  describe('Security', () => {
    it('should reject request with malformed Bearer token', () => {
      return request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer')
        .expect(401);
    });

    it('should reject request with wrong auth scheme', () => {
      return request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Basic token')
        .expect(401);
    });

    it('should reject request without Bearer prefix', () => {
      return request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'some-token')
        .expect(401);
    });
  });
});

