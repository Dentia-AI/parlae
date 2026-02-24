import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { StripeService } from './stripe.service';
import { PaymentService } from './payment.service';
import { RefundService } from './refund.service';
import { createMockStripeService } from '../../test/mocks/stripe.mock';

describe('WebhookService', () => {
  let service: WebhookService;
  let stripeService: any;
  let paymentService: any;
  let refundService: any;

  beforeEach(async () => {
    const mockStripe = createMockStripeService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: StripeService, useValue: mockStripe },
        {
          provide: PaymentService,
          useValue: {
            processSuccessfulPayment: jest.fn().mockResolvedValue(undefined),
            processFailedPayment: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RefundService,
          useValue: {
            processRefundUpdate: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    stripeService = module.get(StripeService);
    paymentService = module.get(PaymentService);
    refundService = module.get(RefundService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructEvent', () => {
    it('should construct event from valid payload', () => {
      const mockEvent = { id: 'evt_1', type: 'test' };
      stripeService._mockClient.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = service.constructEvent(Buffer.from('payload'), 'sig');
      expect(result).toEqual(mockEvent);
    });

    it('should throw BadRequestException for invalid signature', () => {
      stripeService._mockClient.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      expect(() => service.constructEvent(Buffer.from('bad'), 'bad-sig')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('handleEvent', () => {
    it('should handle checkout.session.completed', async () => {
      await service.handleEvent({
        type: 'checkout.session.completed',
        data: {
          object: { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1' },
        },
      } as any);
      expect(paymentService.processSuccessfulPayment).toHaveBeenCalledWith('cs_1', 'pi_1');
    });

    it('should handle checkout.session.async_payment_failed', async () => {
      await service.handleEvent({
        type: 'checkout.session.async_payment_failed',
        data: { object: { id: 'cs_2' } },
      } as any);
      expect(paymentService.processFailedPayment).toHaveBeenCalledWith('cs_2', 'Async payment failed');
    });

    it('should handle charge.refunded', async () => {
      await service.handleEvent({
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_1',
            refunds: { data: [{ id: 're_1', status: 'succeeded' }] },
          },
        },
      } as any);
      expect(refundService.processRefundUpdate).toHaveBeenCalledWith('re_1', 'succeeded');
    });

    it('should handle unrecognized event type gracefully', async () => {
      await expect(
        service.handleEvent({ type: 'unknown.event', data: { object: {} } } as any),
      ).resolves.toBeUndefined();
    });

    it('should propagate errors from handlers', async () => {
      paymentService.processSuccessfulPayment.mockRejectedValue(new Error('DB error'));
      await expect(
        service.handleEvent({
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1' } },
        } as any),
      ).rejects.toThrow('DB error');
    });
  });
});
