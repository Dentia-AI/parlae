import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { HealthModule } from '../src/health/health.module';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({
          status: 'ok',
          timestamp: expect.any(String),
        });
      });
  });

  it('/health should return valid ISO timestamp', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        const timestamp = new Date(res.body.timestamp);
        expect(timestamp).toBeInstanceOf(Date);
        expect(timestamp.toISOString()).toBe(res.body.timestamp);
      });
  });

  it('/health should return 200 status code', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200);
  });

  it('/health should have correct response structure', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('timestamp');
        expect(Object.keys(res.body).length).toBe(2);
      });
  });
});

