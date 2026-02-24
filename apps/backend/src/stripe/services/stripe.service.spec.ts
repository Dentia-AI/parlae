import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({ fake: 'stripe-client' }));
});

describe('StripeService', () => {
  let service: StripeService;
  let configService: any;

  const createService = async (overrides: Record<string, string> = {}) => {
    const defaults: Record<string, string | undefined> = {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
      ...overrides,
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => defaults[key]) },
        },
      ],
    }).compile();
    return module.get<StripeService>(StripeService);
  };

  beforeEach(async () => {
    service = await createService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize Stripe client', () => {
      service.onModuleInit();
      expect(service.getClient()).toBeDefined();
    });

    it('should throw if STRIPE_SECRET_KEY is missing', async () => {
      const svc = await createService({ STRIPE_SECRET_KEY: '' });
      expect(() => svc.onModuleInit()).toThrow('STRIPE_SECRET_KEY is not configured');
    });
  });

  describe('getClient', () => {
    it('should return Stripe client after init', () => {
      service.onModuleInit();
      expect(service.getClient()).toBeDefined();
    });

    it('should throw if not initialized', () => {
      expect(() => service.getClient()).toThrow('Stripe client not initialized');
    });
  });

  describe('getWebhookSecret', () => {
    it('should return webhook secret', () => {
      expect(service.getWebhookSecret()).toBe('whsec_test_123');
    });

    it('should throw if not configured', async () => {
      const svc = await createService({ STRIPE_WEBHOOK_SECRET: '' });
      expect(() => svc.getWebhookSecret()).toThrow('STRIPE_WEBHOOK_SECRET is not configured');
    });
  });
});
