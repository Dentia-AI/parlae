import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RefundService, CreateRefundDto } from './refund.service';
import { StripeService } from './stripe.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';
import { createMockStripeService } from '../../test/mocks/stripe.mock';

describe('RefundService', () => {
  let service: RefundService;
  let prisma: any;
  let stripeService: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const mockStripe = createMockStripeService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StripeService, useValue: mockStripe },
      ],
    }).compile();

    service = module.get<RefundService>(RefundService);
    prisma = module.get(PrismaService);
    stripeService = module.get(StripeService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRefund', () => {
    it('should create refund for valid payment', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        status: 'SUCCEEDED',
        stripePaymentIntentId: 'pi_test',
        amountCents: 5000,
      });
      prisma.refund.create.mockResolvedValue({ id: 'ref-1', amountCents: 5000 });
      prisma.refund.findMany.mockResolvedValue([{ amountCents: 5000, status: 'SUCCEEDED' }]);
      prisma.payment.update.mockResolvedValue({});

      const result = await service.createRefund({ paymentId: 'pay-1' });
      expect(result.id).toBe('ref-1');
    });

    it('should throw NotFoundException if payment not found', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(service.createRefund({ paymentId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('should throw if payment not SUCCEEDED', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', status: 'PENDING' });
      await expect(service.createRefund({ paymentId: 'pay-1' })).rejects.toThrow(
        'Cannot refund a payment that has not been successfully completed',
      );
    });

    it('should throw if no Stripe payment intent ID', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        status: 'SUCCEEDED',
        stripePaymentIntentId: null,
      });
      await expect(service.createRefund({ paymentId: 'pay-1' })).rejects.toThrow(
        'Payment does not have a Stripe payment intent ID',
      );
    });
  });

  describe('processRefundUpdate', () => {
    it('should update refund status', async () => {
      prisma.refund.findFirst.mockResolvedValue({ id: 'ref-1' });
      prisma.refund.update.mockResolvedValue({ id: 'ref-1' });

      await service.processRefundUpdate('re_stripe_123', 'succeeded');
      expect(prisma.refund.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'SUCCEEDED' },
        }),
      );
    });

    it('should handle refund not found', async () => {
      prisma.refund.findFirst.mockResolvedValue(null);
      await service.processRefundUpdate('re_unknown', 'succeeded');
      expect(prisma.refund.update).not.toHaveBeenCalled();
    });
  });

  describe('getTotalRefundedAmount', () => {
    it('should sum refund amounts', async () => {
      prisma.refund.findMany.mockResolvedValue([
        { amountCents: 2000, status: 'SUCCEEDED' },
        { amountCents: 1000, status: 'PENDING' },
      ]);
      const total = await service.getTotalRefundedAmount('pay-1');
      expect(total).toBe(3000);
    });

    it('should return 0 when no refunds', async () => {
      prisma.refund.findMany.mockResolvedValue([]);
      const total = await service.getTotalRefundedAmount('pay-1');
      expect(total).toBe(0);
    });
  });

  describe('getRefundById', () => {
    it('should return refund with payment', async () => {
      prisma.refund.findUnique.mockResolvedValue({ id: 'ref-1' });
      const result = await service.getRefundById('ref-1');
      expect(result).toEqual({ id: 'ref-1' });
    });
  });

  describe('getPaymentRefunds', () => {
    it('should return refunds for payment', async () => {
      prisma.refund.findMany.mockResolvedValue([{ id: 'ref-1' }]);
      const result = await service.getPaymentRefunds('pay-1');
      expect(result).toHaveLength(1);
    });
  });
});
