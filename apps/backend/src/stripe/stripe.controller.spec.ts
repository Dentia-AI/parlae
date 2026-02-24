import { Test, TestingModule } from '@nestjs/testing';
import { StripeController } from './stripe.controller';
import { PaymentService } from './services/payment.service';
import { RefundService } from './services/refund.service';
import { WebhookService } from './services/webhook.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { CognitoJwtVerifierService } from '../auth/cognito-jwt-verifier.service';
import { ConfigService } from '@nestjs/config';

describe('StripeController', () => {
  let controller: StripeController;
  let paymentService: any;
  let refundService: any;
  let webhookService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeController],
      providers: [
        {
          provide: PaymentService,
          useValue: {
            createCheckoutSession: jest.fn().mockResolvedValue({ sessionId: 'cs_1' }),
            getUserPayments: jest.fn().mockResolvedValue([]),
            getAccountPayments: jest.fn().mockResolvedValue([]),
            getPaymentById: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: RefundService,
          useValue: {
            createRefund: jest.fn().mockResolvedValue({ id: 'ref-1' }),
            getPaymentRefunds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: WebhookService,
          useValue: {
            constructEvent: jest.fn().mockReturnValue({ type: 'test', id: 'evt_1' }),
            handleEvent: jest.fn().mockResolvedValue(undefined),
          },
        },
        CognitoAuthGuard,
        {
          provide: CognitoJwtVerifierService,
          useValue: { verifyToken: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<StripeController>(StripeController);
    paymentService = module.get(PaymentService);
    refundService = module.get(RefundService);
    webhookService = module.get(WebhookService);

    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ keys: [] }) });
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createCheckoutSession', () => {
    it('should delegate to paymentService', async () => {
      const dto = { userId: 'u-1', amountCents: 1000, paymentType: 'ONE_TIME' as const, customerEmail: 'a@b.com', returnUrl: 'http://test' };
      const result = await controller.createCheckoutSession(dto);
      expect(result).toEqual({ sessionId: 'cs_1' });
    });
  });

  describe('getUserPayments', () => {
    it('should return user payments', async () => {
      const result = await controller.getUserPayments('u-1');
      expect(result).toEqual([]);
      expect(paymentService.getUserPayments).toHaveBeenCalledWith('u-1');
    });
  });

  describe('getAccountPayments', () => {
    it('should return account payments', async () => {
      const result = await controller.getAccountPayments('acc-1');
      expect(result).toEqual([]);
    });
  });

  describe('createRefund', () => {
    it('should delegate to refundService', async () => {
      const result = await controller.createRefund({ paymentId: 'pay-1' });
      expect(result).toEqual({ id: 'ref-1' });
    });
  });

  describe('handleWebhook', () => {
    it('should construct event and handle it', async () => {
      const mockRequest = { rawBody: Buffer.from('test-payload') } as any;
      const result = await controller.handleWebhook(mockRequest, 'sig-123');
      expect(result).toEqual({ received: true });
      expect(webhookService.constructEvent).toHaveBeenCalled();
      expect(webhookService.handleEvent).toHaveBeenCalled();
    });

    it('should throw if rawBody is missing', async () => {
      const mockRequest = { rawBody: undefined } as any;
      await expect(controller.handleWebhook(mockRequest, 'sig')).rejects.toThrow('Missing request body');
    });
  });
});
