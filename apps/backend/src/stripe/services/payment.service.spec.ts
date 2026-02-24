import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService, CreatePaymentDto } from './payment.service';
import { StripeService } from './stripe.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';
import { createMockStripeService } from '../../test/mocks/stripe.mock';

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: any;
  let stripeService: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const mockStripe = createMockStripeService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StripeService, useValue: mockStripe },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    prisma = module.get(PrismaService);
    stripeService = module.get(StripeService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCheckoutSession', () => {
    const dto: CreatePaymentDto = {
      userId: 'user-1',
      amountCents: 5000,
      paymentType: 'ONE_TIME',
      customerEmail: 'test@example.com',
      returnUrl: 'https://example.com/return',
    };

    it('should create checkout session and payment record', async () => {
      prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
      const result = await service.createCheckoutSession(dto);

      expect(result.sessionId).toBe('cs_test_123');
      expect(result.clientSecret).toBe('cs_secret_123');
      expect(prisma.payment.create).toHaveBeenCalledTimes(1);
    });

    it('should handle recurring payment type', async () => {
      prisma.payment.create.mockResolvedValue({ id: 'pay-2' });
      const recurringDto: CreatePaymentDto = {
        ...dto,
        paymentType: 'RECURRING',
        isRecurring: true,
        recurringInterval: 'MONTHLY',
        recurringFrequency: 1,
      };
      const result = await service.createCheckoutSession(recurringDto);
      expect(result.sessionId).toBe('cs_test_123');
    });

    it('should throw on Stripe error', async () => {
      stripeService._mockClient.checkout.sessions.create.mockRejectedValueOnce(
        new Error('Stripe error'),
      );
      await expect(service.createCheckoutSession(dto)).rejects.toThrow('Stripe error');
    });
  });

  describe('processSuccessfulPayment', () => {
    it('should update payment status to SUCCEEDED', async () => {
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1' });
      prisma.payment.update.mockResolvedValue({ id: 'pay-1', status: 'SUCCEEDED' });

      await service.processSuccessfulPayment('session-1', 'pi-1');

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-1' },
          data: expect.objectContaining({ status: 'SUCCEEDED' }),
        }),
      );
    });

    it('should handle payment not found', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      await service.processSuccessfulPayment('unknown-session', 'pi-1');
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('processFailedPayment', () => {
    it('should update payment status to FAILED', async () => {
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', failureCount: 0 });
      prisma.payment.update.mockResolvedValue({ id: 'pay-1', status: 'FAILED' });

      await service.processFailedPayment('session-1', 'Card declined');

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('should handle missing payment gracefully', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      await service.processFailedPayment('missing', 'fail');
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentById', () => {
    it('should return payment with relations', async () => {
      const mockPayment = { id: 'pay-1', userId: 'u-1' };
      prisma.payment.findUnique.mockResolvedValue(mockPayment);
      const result = await service.getPaymentById('pay-1');
      expect(result).toEqual(mockPayment);
    });

    it('should return null for missing payment', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      const result = await service.getPaymentById('missing');
      expect(result).toBeNull();
    });
  });

  describe('getUserPayments', () => {
    it('should return user payments ordered by createdAt desc', async () => {
      prisma.payment.findMany.mockResolvedValue([{ id: 'pay-1' }]);
      const result = await service.getUserPayments('user-1');
      expect(result).toHaveLength(1);
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('getAccountPayments', () => {
    it('should return account payments', async () => {
      prisma.payment.findMany.mockResolvedValue([]);
      const result = await service.getAccountPayments('acc-1');
      expect(result).toEqual([]);
    });
  });
});
