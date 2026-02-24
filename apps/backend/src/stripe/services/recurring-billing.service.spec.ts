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
  });
});
