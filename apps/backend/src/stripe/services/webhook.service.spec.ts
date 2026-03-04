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

    it('should handle checkout.session.async_payment_succeeded with payment_intent', async () => {
      await service.handleEvent({
        type: 'checkout.session.async_payment_succeeded',
        data: {
          object: { id: 'cs_async_1', payment_intent: 'pi_async_1' },
        },
      } as any);

      expect(paymentService.processSuccessfulPayment).toHaveBeenCalledWith(
        'cs_async_1',
        'pi_async_1',
      );
    });

    it('should skip processing async_payment_succeeded when no payment_intent', async () => {
      await service.handleEvent({
        type: 'checkout.session.async_payment_succeeded',
        data: {
          object: { id: 'cs_async_2', payment_intent: null },
        },
      } as any);

      expect(paymentService.processSuccessfulPayment).not.toHaveBeenCalled();
    });

    it('should handle payment_intent.succeeded', async () => {
      await expect(
        service.handleEvent({
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_success_1' } },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('should handle payment_intent.payment_failed', async () => {
      await expect(
        service.handleEvent({
          type: 'payment_intent.payment_failed',
          data: {
            object: {
              id: 'pi_fail_1',
              last_payment_error: { message: 'Card declined' },
            },
          },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('should handle payment_intent.payment_failed without error message', async () => {
      await expect(
        service.handleEvent({
          type: 'payment_intent.payment_failed',
          data: {
            object: {
              id: 'pi_fail_2',
              last_payment_error: null,
            },
          },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('should handle invoice.payment_succeeded with subscription string', async () => {
      await expect(
        service.handleEvent({
          type: 'invoice.payment_succeeded',
          data: {
            object: { id: 'inv_1', subscription: 'sub_123' },
          },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('should handle invoice.payment_succeeded with subscription object', async () => {
      await expect(
        service.handleEvent({
          type: 'invoice.payment_succeeded',
          data: {
            object: { id: 'inv_2', subscription: { id: 'sub_456' } },
          },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('should handle invoice.payment_succeeded without subscription', async () => {
      await expect(
        service.handleEvent({
          type: 'invoice.payment_succeeded',
          data: {
            object: { id: 'inv_3', subscription: null },
          },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('should handle invoice.payment_failed with subscription string', async () => {
      await expect(
        service.handleEvent({
          type: 'invoice.payment_failed',
          data: {
            object: { id: 'inv_fail_1', subscription: 'sub_789' },
          },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('should handle invoice.payment_failed with subscription object', async () => {
      await expect(
        service.handleEvent({
          type: 'invoice.payment_failed',
          data: {
            object: { id: 'inv_fail_2', subscription: { id: 'sub_999' } },
          },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('should handle invoice.payment_failed without subscription', async () => {
      await expect(
        service.handleEvent({
          type: 'invoice.payment_failed',
          data: {
            object: { id: 'inv_fail_3', subscription: null },
          },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('should not process checkout.session.completed when payment_status is not paid', async () => {
      await service.handleEvent({
        type: 'checkout.session.completed',
        data: {
          object: { id: 'cs_unpaid', payment_status: 'unpaid', payment_intent: 'pi_1' },
        },
      } as any);

      expect(paymentService.processSuccessfulPayment).not.toHaveBeenCalled();
    });

    it('should not process checkout.session.completed when no payment_intent', async () => {
      await service.handleEvent({
        type: 'checkout.session.completed',
        data: {
          object: { id: 'cs_no_pi', payment_status: 'paid', payment_intent: null },
        },
      } as any);

      expect(paymentService.processSuccessfulPayment).not.toHaveBeenCalled();
    });

    it('should handle charge.refunded with no refunds data', async () => {
      await service.handleEvent({
        type: 'charge.refunded',
        data: {
          object: { id: 'ch_no_refunds', refunds: null },
        },
      } as any);

      expect(refundService.processRefundUpdate).not.toHaveBeenCalled();
    });

    it('should handle charge.refunded with empty refunds array', async () => {
      await service.handleEvent({
        type: 'charge.refunded',
        data: {
          object: { id: 'ch_empty_refunds', refunds: { data: [] } },
        },
      } as any);

      expect(refundService.processRefundUpdate).not.toHaveBeenCalled();
    });

    it('should process multiple refunds in charge.refunded', async () => {
      await service.handleEvent({
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_multi_refund',
            refunds: {
              data: [
                { id: 're_1', status: 'succeeded' },
                { id: 're_2', status: 'pending' },
              ],
            },
          },
        },
      } as any);

      expect(refundService.processRefundUpdate).toHaveBeenCalledTimes(2);
      expect(refundService.processRefundUpdate).toHaveBeenCalledWith('re_1', 'succeeded');
      expect(refundService.processRefundUpdate).toHaveBeenCalledWith('re_2', 'pending');
    });

    it('should use "pending" when refund status is null', async () => {
      await service.handleEvent({
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_null_status',
            refunds: { data: [{ id: 're_null', status: null }] },
          },
        },
      } as any);

      expect(refundService.processRefundUpdate).toHaveBeenCalledWith('re_null', 'pending');
    });
  });
});
