jest.mock('@kit/billing', () => ({
  BillingWebhookHandlerService: class {},
}));

jest.mock('@kit/billing/types', () => ({}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('./stripe-sdk', () => ({
  createStripeClient: jest.fn(),
}));

jest.mock('../schema/stripe-server-env.schema', () => ({
  StripeServerEnvSchema: {
    parse: jest.fn(() => ({
      secretKey: 'sk_test',
      webhooksSecret: 'whsec_test',
    })),
  },
}));

jest.mock('./stripe-subscription-payload-builder.service', () => ({
  createStripeSubscriptionPayloadBuilderService: jest.fn(),
}));

import { StripeWebhookHandlerService } from './stripe-webhook-handler.service';
import { createStripeClient } from './stripe-sdk';
import { createStripeSubscriptionPayloadBuilderService } from './stripe-subscription-payload-builder.service';

const mockCreateStripeClient = createStripeClient as jest.Mock;
const mockCreatePayloadBuilder =
  createStripeSubscriptionPayloadBuilderService as jest.Mock;

type PlanTypeMap = Map<string, 'flat' | 'per_seat' | 'metered'>;

describe('StripeWebhookHandlerService', () => {
  let service: StripeWebhookHandlerService;
  const planTypesMap: PlanTypeMap = new Map([
    ['price_1', 'flat'],
    ['price_2', 'per_seat'],
  ]);

  const mockStripe = {
    subscriptions: { retrieve: jest.fn() },
    checkout: { sessions: { retrieve: jest.fn() } },
    webhooks: { constructEventAsync: jest.fn() },
  };

  const mockPayloadBuilder = {
    build: jest.fn(),
    getPeriodStartsAt: jest.fn().mockReturnValue(1704067200),
    getPeriodEndsAt: jest.fn().mockReturnValue(1706745600),
  };

  const mockCallbacks = {
    onCheckoutSessionCompleted: jest.fn().mockResolvedValue(undefined),
    onSubscriptionUpdated: jest.fn().mockResolvedValue(undefined),
    onSubscriptionDeleted: jest.fn().mockResolvedValue(undefined),
    onPaymentSucceeded: jest.fn().mockResolvedValue(undefined),
    onPaymentFailed: jest.fn().mockResolvedValue(undefined),
    onInvoicePaid: jest.fn().mockResolvedValue(undefined),
    onEvent: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateStripeClient.mockResolvedValue(mockStripe);
    mockCreatePayloadBuilder.mockReturnValue(mockPayloadBuilder);
    service = new StripeWebhookHandlerService(planTypesMap);
  });

  describe('verifyWebhookSignature', () => {
    it('verifies the webhook signature and returns the event', async () => {
      const mockEvent = { type: 'test.event', data: {} };
      mockStripe.webhooks.constructEventAsync.mockResolvedValue(mockEvent);

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_test' },
        body: '{"test": true}',
      });

      const result = await service.verifyWebhookSignature(request);

      expect(mockStripe.webhooks.constructEventAsync).toHaveBeenCalledWith(
        '{"test": true}',
        'sig_test',
        'whsec_test',
      );
      expect(result).toEqual(mockEvent);
    });

    it('throws when event construction returns null', async () => {
      mockStripe.webhooks.constructEventAsync.mockResolvedValue(null);

      const request = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'bad_sig' },
        body: '{}',
      });

      await expect(service.verifyWebhookSignature(request)).rejects.toThrow(
        'Invalid signature',
      );
    });
  });

  describe('handleWebhookEvent', () => {
    const mockSubscription = {
      id: 'sub_123',
      customer: 'cus_123',
      metadata: { accountId: 'acc-1' },
      status: 'active',
      currency: 'usd',
      cancel_at_period_end: false,
      trial_start: null,
      trial_end: null,
      items: {
        data: [
          {
            id: 'si_1',
            quantity: 1,
            price: { id: 'price_1', product: 'prod_1' },
          },
        ],
      },
    };

    describe('checkout.session.completed (subscription)', () => {
      it('builds subscription payload and calls callback', async () => {
        const event = {
          type: 'checkout.session.completed' as const,
          data: {
            object: {
              id: 'cs_123',
              mode: 'subscription',
              client_reference_id: 'acc-1',
              customer: 'cus_123',
              subscription: 'sub_123',
            },
          },
        };

        mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription);

        const builtPayload = {
          target_subscription_id: 'sub_123',
          target_account_id: 'acc-1',
          target_customer_id: 'cus_123',
          billing_provider: 'stripe',
          status: 'active',
          active: true,
          currency: 'usd',
          line_items: [],
        };
        mockPayloadBuilder.build.mockReturnValue(builtPayload);

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith(
          'sub_123',
        );
        expect(
          mockCallbacks.onCheckoutSessionCompleted,
        ).toHaveBeenCalledWith(builtPayload);
        expect(mockCallbacks.onEvent).toHaveBeenCalledWith(event);
      });
    });

    describe('checkout.session.completed (one-time payment)', () => {
      it('builds order payload and calls callback', async () => {
        const event = {
          type: 'checkout.session.completed' as const,
          data: {
            object: {
              id: 'cs_456',
              mode: 'payment',
              client_reference_id: 'acc-1',
              customer: 'cus_123',
              currency: 'usd',
            },
          },
        };

        mockStripe.checkout.sessions.retrieve.mockResolvedValue({
          line_items: {
            data: [
              {
                id: 'li_1',
                price: { id: 'price_1', product: 'prod_1', unit_amount: 5000 },
                quantity: 1,
              },
            ],
          },
          payment_status: 'paid',
          amount_total: 5000,
        });

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(
          mockCallbacks.onCheckoutSessionCompleted,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            target_order_id: 'cs_456',
            target_account_id: 'acc-1',
            target_customer_id: 'cus_123',
            billing_provider: 'stripe',
            total_amount: 5000,
          }),
        );
      });

      it('sets status to pending for unpaid sessions', async () => {
        const event = {
          type: 'checkout.session.completed' as const,
          data: {
            object: {
              id: 'cs_unpaid',
              mode: 'payment',
              client_reference_id: 'acc-1',
              customer: 'cus_123',
              currency: 'usd',
            },
          },
        };

        mockStripe.checkout.sessions.retrieve.mockResolvedValue({
          line_items: { data: [] },
          payment_status: 'unpaid',
          amount_total: 0,
        });

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(
          mockCallbacks.onCheckoutSessionCompleted,
        ).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'pending' }),
        );
      });
    });

    describe('customer.subscription.updated', () => {
      it('builds subscription payload and calls callback', async () => {
        const event = {
          type: 'customer.subscription.updated' as const,
          data: { object: mockSubscription },
        };

        const builtPayload = {
          target_subscription_id: 'sub_123',
          target_account_id: 'acc-1',
          billing_provider: 'stripe',
          status: 'active',
        };
        mockPayloadBuilder.build.mockReturnValue(builtPayload);

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(mockCallbacks.onSubscriptionUpdated).toHaveBeenCalledWith(
          builtPayload,
        );
        expect(mockCallbacks.onEvent).toHaveBeenCalledWith(event);
      });
    });

    describe('customer.subscription.deleted', () => {
      it('calls callback with subscription id', async () => {
        const event = {
          type: 'customer.subscription.deleted' as const,
          data: { object: { id: 'sub_to_delete' } },
        };

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(mockCallbacks.onSubscriptionDeleted).toHaveBeenCalledWith(
          'sub_to_delete',
        );
        expect(mockCallbacks.onEvent).toHaveBeenCalledWith(event);
      });
    });

    describe('checkout.session.async_payment_failed', () => {
      it('calls onPaymentFailed with session id', async () => {
        const event = {
          type: 'checkout.session.async_payment_failed' as const,
          data: { object: { id: 'cs_failed' } },
        };

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(mockCallbacks.onPaymentFailed).toHaveBeenCalledWith(
          'cs_failed',
        );
        expect(mockCallbacks.onEvent).toHaveBeenCalledWith(event);
      });
    });

    describe('checkout.session.async_payment_succeeded', () => {
      it('calls onPaymentSucceeded with session id', async () => {
        const event = {
          type: 'checkout.session.async_payment_succeeded' as const,
          data: { object: { id: 'cs_success' } },
        };

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(mockCallbacks.onPaymentSucceeded).toHaveBeenCalledWith(
          'cs_success',
        );
        expect(mockCallbacks.onEvent).toHaveBeenCalledWith(event);
      });
    });

    describe('invoice.paid', () => {
      it('retrieves subscription from invoice and builds payload', async () => {
        const event = {
          type: 'invoice.paid' as const,
          data: {
            object: {
              id: 'inv_123',
              customer: 'cus_123',
              subscription: 'sub_123',
            },
          },
        };

        mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription);

        const builtPayload = {
          target_subscription_id: 'sub_123',
          target_account_id: 'acc-1',
          billing_provider: 'stripe',
        };
        mockPayloadBuilder.build.mockReturnValue(builtPayload);

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith(
          'sub_123',
        );
        expect(mockCallbacks.onInvoicePaid).toHaveBeenCalledWith(
          builtPayload,
        );
      });

      it('skips when invoice has no id', async () => {
        const event = {
          type: 'invoice.paid' as const,
          data: {
            object: {
              id: null,
              customer: 'cus_123',
              subscription: 'sub_123',
            },
          },
        };

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(mockCallbacks.onInvoicePaid).not.toHaveBeenCalled();
      });

      it('skips when subscription id is not found', async () => {
        const event = {
          type: 'invoice.paid' as const,
          data: {
            object: {
              id: 'inv_123',
              customer: 'cus_123',
            },
          },
        };

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(mockCallbacks.onInvoicePaid).not.toHaveBeenCalled();
      });

      it('handles Stripe 18+ invoice structure with parent subscription', async () => {
        const event = {
          type: 'invoice.paid' as const,
          data: {
            object: {
              id: 'inv_v18',
              customer: 'cus_123',
              parent: {
                subscription_details: { subscription: 'sub_v18' },
              },
            },
          },
        };

        const sub = { ...mockSubscription, id: 'sub_v18' };
        mockStripe.subscriptions.retrieve.mockResolvedValue(sub);

        const builtPayload = { target_subscription_id: 'sub_v18' };
        mockPayloadBuilder.build.mockReturnValue(builtPayload);

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith(
          'sub_v18',
        );
        expect(mockCallbacks.onInvoicePaid).toHaveBeenCalledWith(
          builtPayload,
        );
      });
    });

    describe('unhandled event type', () => {
      it('calls onEvent when provided', async () => {
        const event = {
          type: 'some.unknown.event',
          data: { object: {} },
        };

        await service.handleWebhookEvent(event as any, mockCallbacks);

        expect(mockCallbacks.onEvent).toHaveBeenCalledWith(event);
      });

      it('does nothing when onEvent is not provided', async () => {
        const event = {
          type: 'some.unknown.event',
          data: { object: {} },
        };

        const callbacksWithoutOnEvent = {
          ...mockCallbacks,
          onEvent: undefined,
        };

        await expect(
          service.handleWebhookEvent(event as any, callbacksWithoutOnEvent),
        ).resolves.toBeUndefined();
      });
    });

    describe('getLineItems (via subscription events)', () => {
      it('maps line item types from planTypesMap', async () => {
        const event = {
          type: 'customer.subscription.updated' as const,
          data: { object: mockSubscription },
        };

        mockPayloadBuilder.build.mockImplementation((params: any) => ({
          lineItems: params.lineItems,
        }));

        await service.handleWebhookEvent(event as any, mockCallbacks);

        const buildCall = mockPayloadBuilder.build.mock.calls[0]![0];
        expect(buildCall.lineItems[0].type).toBe('flat');
      });

      it('defaults to flat when line item is not in planTypesMap', async () => {
        const sub = {
          ...mockSubscription,
          items: {
            data: [
              {
                id: 'si_unknown',
                quantity: 1,
                price: { id: 'price_unknown', product: 'prod_x' },
              },
            ],
          },
        };

        const event = {
          type: 'customer.subscription.updated' as const,
          data: { object: sub },
        };

        mockPayloadBuilder.build.mockImplementation((params: any) => ({
          lineItems: params.lineItems,
        }));

        const consoleSpy = jest
          .spyOn(console, 'warn')
          .mockImplementation(() => {});

        await service.handleWebhookEvent(event as any, mockCallbacks);

        const buildCall = mockPayloadBuilder.build.mock.calls[0]![0];
        expect(buildCall.lineItems[0].type).toBe('flat');

        consoleSpy.mockRestore();
      });
    });
  });
});
