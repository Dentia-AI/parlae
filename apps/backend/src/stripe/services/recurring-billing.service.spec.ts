import { Test, TestingModule } from '@nestjs/testing';
import { RecurringBillingService } from './recurring-billing.service';
import { StripeService } from './stripe.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';
import { createMockStripeService } from '../../test/mocks/stripe.mock';

describe('RecurringBillingService', () => {
  let service: RecurringBillingService;
  let prisma: any;
  let stripeService: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const mockStripe = createMockStripeService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringBillingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StripeService, useValue: mockStripe },
      ],
    }).compile();

    service = module.get<RecurringBillingService>(RecurringBillingService);
    prisma = module.get(PrismaService);
    stripeService = module.get(StripeService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processRecurringPayments', () => {
    it('should process due payments', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        accountId: 'acc-1',
        recurringInterval: 'MONTHLY',
        recurringFrequency: 1,
        failureCount: 0,
        user: { email: 'test@example.com' },
        account: {},
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(prisma.payment.findMany).toHaveBeenCalled();
      expect(prisma.payment.update).toHaveBeenCalled();
    });

    it('should handle no due payments', async () => {
      prisma.payment.findMany.mockResolvedValue([]);
      await service.processRecurringPayments();
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('should handle payment failure after 3 attempts', async () => {
      const duePayment = {
        id: 'pay-fail',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        failureCount: 2,
        user: { email: 'test@example.com' },
        account: {},
        recurringInterval: 'MONTHLY',
        recurringFrequency: 1,
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      stripeService._mockClient.paymentIntents.create.mockRejectedValueOnce(
        new Error('Card declined'),
      );
      prisma.payment.findUnique.mockResolvedValue({ ...duePayment });
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            isRecurring: false,
          }),
        }),
      );
    });

    it('should handle payment intent not succeeded', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        accountId: 'acc-1',
        recurringInterval: 'MONTHLY',
        recurringFrequency: 1,
        failureCount: 0,
        user: { email: 'test@example.com' },
        account: {},
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      stripeService._mockClient.paymentIntents.create.mockResolvedValueOnce({
        id: 'pi_1',
        status: 'requires_payment_method',
      });
      prisma.payment.findUnique.mockResolvedValue({ ...duePayment });
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failureCount: 1,
            failureReason: 'Payment intent not succeeded',
          }),
        }),
      );
    });

    it('should increment failure count when failureCount < 3', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        failureCount: 0,
        user: { email: 'test@example.com' },
        account: {},
        recurringInterval: 'MONTHLY',
        recurringFrequency: 1,
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      stripeService._mockClient.paymentIntents.create.mockRejectedValueOnce(
        new Error('Card declined'),
      );
      prisma.payment.findUnique.mockResolvedValue({ ...duePayment });
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failureCount: 1,
            failureReason: 'Card declined',
          }),
        }),
      );
    });

    it('should use existing Stripe customer when found', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        accountId: 'acc-1',
        recurringInterval: 'MONTHLY',
        recurringFrequency: 1,
        failureCount: 0,
        user: { email: 'existing@example.com' },
        account: {},
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      stripeService._mockClient.customers.list.mockResolvedValueOnce({
        data: [{ id: 'cus_existing', email: 'existing@example.com' }],
      });
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(stripeService._mockClient.customers.create).not.toHaveBeenCalled();
      expect(stripeService._mockClient.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_existing' }),
      );
    });

    it('should handle top-level error gracefully', async () => {
      prisma.payment.findMany.mockRejectedValue(new Error('DB connection failed'));

      await expect(service.processRecurringPayments()).resolves.not.toThrow();
    });

    it('should handle payment not found in failure handler', async () => {
      const duePayment = {
        id: 'pay-missing',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        failureCount: 0,
        user: { email: 'test@example.com' },
        account: {},
        recurringInterval: 'MONTHLY',
        recurringFrequency: 1,
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      stripeService._mockClient.paymentIntents.create.mockRejectedValueOnce(
        new Error('Card declined'),
      );
      prisma.payment.findUnique.mockResolvedValue(null);

      await service.processRecurringPayments();

      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('should calculate next billing date for DAILY interval', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        accountId: 'acc-1',
        recurringInterval: 'DAILY',
        recurringFrequency: 1,
        failureCount: 0,
        user: { email: 'test@example.com' },
        account: {},
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      const updateCall = prisma.payment.update.mock.calls[0];
      const nextBillingDate = updateCall[0].data.nextBillingDate as Date;
      expect(nextBillingDate).toBeDefined();
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(expected.getDate() + 1);
      expect(nextBillingDate.getDate()).toBe(expected.getDate());
    });

    it('should calculate next billing date for WEEKLY interval', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        accountId: 'acc-1',
        recurringInterval: 'WEEKLY',
        recurringFrequency: 1,
        failureCount: 0,
        user: { email: 'test@example.com' },
        account: {},
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(prisma.payment.update).toHaveBeenCalled();
      const updateCall = prisma.payment.update.mock.calls[0];
      const nextBillingDate = updateCall[0].data.nextBillingDate as Date;
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(expected.getDate() + 7);
      expect(nextBillingDate.getDate()).toBe(expected.getDate());
    });

    it('should calculate next billing date for YEARLY interval', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        accountId: 'acc-1',
        recurringInterval: 'YEARLY',
        recurringFrequency: 1,
        failureCount: 0,
        user: { email: 'test@example.com' },
        account: {},
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(prisma.payment.update).toHaveBeenCalled();
      const updateCall = prisma.payment.update.mock.calls[0];
      const nextBillingDate = updateCall[0].data.nextBillingDate as Date;
      const today = new Date();
      expect(nextBillingDate.getFullYear()).toBe(today.getFullYear() + 1);
    });

    it('should use payment methods list when no default payment method', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        accountId: 'acc-1',
        recurringInterval: 'MONTHLY',
        recurringFrequency: 1,
        failureCount: 0,
        user: { email: 'test@example.com' },
        account: {},
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      stripeService._mockClient.customers.retrieve.mockResolvedValueOnce({
        id: 'cus_1',
        invoice_settings: null,
      });
      stripeService._mockClient.paymentMethods.list.mockResolvedValueOnce({
        data: [{ id: 'pm_fallback' }],
      });
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(stripeService._mockClient.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method: 'pm_fallback',
        }),
      );
    });

    it('should create new Stripe customer when none exists', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        accountId: 'acc-1',
        recurringInterval: 'MONTHLY',
        recurringFrequency: 1,
        failureCount: 0,
        user: { email: 'new@example.com' },
        account: {},
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      stripeService._mockClient.customers.list.mockResolvedValueOnce({ data: [] });
      stripeService._mockClient.customers.create.mockResolvedValueOnce({
        id: 'cus_new',
        email: 'new@example.com',
      });
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(stripeService._mockClient.customers.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        metadata: { userId: 'u-1' },
      });
      expect(stripeService._mockClient.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_new' }),
      );
    });

    it('should handle payment with null accountId', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        accountId: null,
        recurringInterval: 'MONTHLY',
        recurringFrequency: 1,
        failureCount: 0,
        user: { email: 'test@example.com' },
        account: {},
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(stripeService._mockClient.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            accountId: '',
            recurringPayment: 'true',
          }),
        }),
      );
    });

    it('should process multiple due payments', async () => {
      const payments = [
        {
          id: 'pay-1',
          amountCents: 1000,
          currency: 'usd',
          userId: 'u-1',
          accountId: 'acc-1',
          recurringInterval: 'MONTHLY',
          recurringFrequency: 1,
          failureCount: 0,
          user: { email: 'u1@example.com' },
          account: {},
        },
        {
          id: 'pay-2',
          amountCents: 2000,
          currency: 'usd',
          userId: 'u-2',
          accountId: 'acc-2',
          recurringInterval: 'MONTHLY',
          recurringFrequency: 1,
          failureCount: 0,
          user: { email: 'u2@example.com' },
          account: {},
        },
      ];
      prisma.payment.findMany.mockResolvedValue(payments);
      stripeService._mockClient.customers.list
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });
      stripeService._mockClient.customers.create
        .mockResolvedValueOnce({ id: 'cus_1', email: 'u1@example.com' })
        .mockResolvedValueOnce({ id: 'cus_2', email: 'u2@example.com' });
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(prisma.payment.update).toHaveBeenCalledTimes(2);
      expect(stripeService._mockClient.paymentIntents.create).toHaveBeenCalledTimes(2);
    });

    it('should calculate next billing date for recurringFrequency 2', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        accountId: 'acc-1',
        recurringInterval: 'WEEKLY',
        recurringFrequency: 2,
        failureCount: 0,
        user: { email: 'test@example.com' },
        account: {},
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      const updateCall = prisma.payment.update.mock.calls[0];
      const nextBillingDate = updateCall[0].data.nextBillingDate as Date;
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(expected.getDate() + 14);
      expect(nextBillingDate.getDate()).toBe(expected.getDate());
    });

    it('should use invoice_settings default_payment_method when available', async () => {
      const duePayment = {
        id: 'pay-1',
        amountCents: 5000,
        currency: 'usd',
        userId: 'u-1',
        accountId: 'acc-1',
        recurringInterval: 'MONTHLY',
        recurringFrequency: 1,
        failureCount: 0,
        user: { email: 'test@example.com' },
        account: {},
      };
      prisma.payment.findMany.mockResolvedValue([duePayment]);
      stripeService._mockClient.customers.retrieve.mockResolvedValueOnce({
        id: 'cus_1',
        invoice_settings: { default_payment_method: 'pm_default' },
      });
      prisma.payment.update.mockResolvedValue({});

      await service.processRecurringPayments();

      expect(stripeService._mockClient.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method: 'pm_default',
        }),
      );
    });
  });
});
