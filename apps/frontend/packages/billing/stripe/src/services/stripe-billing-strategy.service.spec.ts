jest.mock('server-only', () => ({}));

jest.mock('@kit/billing', () => ({
  BillingStrategyProviderService: class {},
}));

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

jest.mock('./create-stripe-checkout', () => ({
  createStripeCheckout: jest.fn(),
}));

jest.mock('./create-stripe-billing-portal-session', () => ({
  createStripeBillingPortalSession: jest.fn(),
}));

jest.mock('./stripe-subscription-payload-builder.service', () => ({
  createStripeSubscriptionPayloadBuilderService: jest.fn(),
}));

import { StripeBillingStrategyService } from './stripe-billing-strategy.service';
import { createStripeCheckout } from './create-stripe-checkout';
import { createStripeBillingPortalSession } from './create-stripe-billing-portal-session';
import { createStripeClient } from './stripe-sdk';
import { createStripeSubscriptionPayloadBuilderService } from './stripe-subscription-payload-builder.service';

const mockCreateCheckout = createStripeCheckout as jest.Mock;
const mockCreatePortal = createStripeBillingPortalSession as jest.Mock;
const mockCreateStripeClient = createStripeClient as jest.Mock;
const mockCreatePayloadBuilder =
  createStripeSubscriptionPayloadBuilderService as jest.Mock;

describe('StripeBillingStrategyService', () => {
  let service: StripeBillingStrategyService;

  const mockStripe = {
    subscriptions: {
      cancel: jest.fn(),
      update: jest.fn(),
      retrieve: jest.fn(),
    },
    checkout: {
      sessions: { retrieve: jest.fn() },
    },
    billing: {
      meterEvents: { create: jest.fn() },
      meters: { listEventSummaries: jest.fn() },
    },
    prices: {
      retrieve: jest.fn(),
    },
  };

  const mockPayloadBuilder = {
    build: jest.fn(),
    getPeriodStartsAt: jest.fn(),
    getPeriodEndsAt: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateStripeClient.mockResolvedValue(mockStripe);
    mockCreatePayloadBuilder.mockReturnValue(mockPayloadBuilder);
    service = new StripeBillingStrategyService();
  });

  describe('createCheckoutSession', () => {
    it('creates a checkout session and returns the client secret', async () => {
      mockCreateCheckout.mockResolvedValue({
        client_secret: 'cs_secret_123',
      });

      const result = await service.createCheckoutSession({
        returnUrl: 'http://localhost/return',
        accountId: '550e8400-e29b-41d4-a716-446655440000',
        plan: {} as any,
        variantQuantities: [],
      });

      expect(mockCreateCheckout).toHaveBeenCalledWith(
        mockStripe,
        expect.objectContaining({
          accountId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      );
      expect(result).toEqual({ checkoutToken: 'cs_secret_123' });
    });

    it('throws when client_secret is not returned', async () => {
      mockCreateCheckout.mockResolvedValue({ client_secret: null });

      await expect(
        service.createCheckoutSession({
          returnUrl: 'http://localhost/return',
          accountId: '550e8400-e29b-41d4-a716-446655440000',
          plan: {} as any,
          variantQuantities: [],
        }),
      ).rejects.toThrow('Failed to create checkout session');
    });
  });

  describe('createBillingPortalSession', () => {
    it('creates a portal session and returns the url', async () => {
      mockCreatePortal.mockResolvedValue({
        url: 'https://billing.stripe.com/portal/sess_123',
      });

      const result = await service.createBillingPortalSession({
        returnUrl: 'http://localhost/return',
        customerId: 'cus_123',
      });

      expect(mockCreatePortal).toHaveBeenCalledWith(
        mockStripe,
        expect.objectContaining({ customerId: 'cus_123' }),
      );
      expect(result.url).toBe('https://billing.stripe.com/portal/sess_123');
    });
  });

  describe('cancelSubscription', () => {
    it('cancels the subscription and returns success', async () => {
      mockStripe.subscriptions.cancel.mockResolvedValue({});

      const result = await service.cancelSubscription({
        subscriptionId: 'sub_123',
      });

      expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123', {
        invoice_now: true,
      });
      expect(result).toEqual({ success: true });
    });

    it('respects the invoiceNow parameter', async () => {
      mockStripe.subscriptions.cancel.mockResolvedValue({});

      await service.cancelSubscription({
        subscriptionId: 'sub_123',
        invoiceNow: false,
      });

      expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123', {
        invoice_now: false,
      });
    });

    it('returns success: false when cancellation fails', async () => {
      mockStripe.subscriptions.cancel.mockRejectedValue(
        new Error('Already cancelled'),
      );

      const result = await service.cancelSubscription({
        subscriptionId: 'sub_123',
      });

      expect(result).toEqual({ success: false });
    });
  });

  describe('retrieveCheckoutSession', () => {
    it('retrieves session details', async () => {
      mockStripe.checkout.sessions.retrieve.mockResolvedValue({
        client_secret: 'cs_secret',
        status: 'complete',
        customer_details: { email: 'test@example.com' },
      });

      const result = await service.retrieveCheckoutSession({
        sessionId: 'cs_123',
      });

      expect(result).toEqual({
        checkoutToken: 'cs_secret',
        isSessionOpen: false,
        status: 'complete',
        customer: { email: 'test@example.com' },
      });
    });

    it('identifies open sessions', async () => {
      mockStripe.checkout.sessions.retrieve.mockResolvedValue({
        client_secret: 'cs_secret',
        status: 'open',
        customer_details: null,
      });

      const result = await service.retrieveCheckoutSession({
        sessionId: 'cs_open',
      });

      expect(result.isSessionOpen).toBe(true);
      expect(result.customer.email).toBeNull();
    });

    it('throws when retrieval fails', async () => {
      mockStripe.checkout.sessions.retrieve.mockRejectedValue(
        new Error('Not found'),
      );

      await expect(
        service.retrieveCheckoutSession({ sessionId: 'cs_bad' }),
      ).rejects.toThrow('Failed to retrieve checkout session');
    });
  });

  describe('reportUsage', () => {
    it('reports usage via the Stripe Metrics API', async () => {
      mockStripe.billing.meterEvents.create.mockResolvedValue({});

      const result = await service.reportUsage({
        id: 'cus_123',
        eventName: 'api_calls',
        usage: { quantity: 10 },
      });

      expect(mockStripe.billing.meterEvents.create).toHaveBeenCalledWith({
        event_name: 'api_calls',
        payload: {
          value: '10',
          stripe_customer_id: 'cus_123',
        },
      });
      expect(result).toEqual({ success: true });
    });

    it('throws when eventName is missing', async () => {
      await expect(
        service.reportUsage({
          id: 'cus_123',
          usage: { quantity: 5 },
        }),
      ).rejects.toThrow('Event name is required');
    });

    it('throws when Stripe API fails', async () => {
      mockStripe.billing.meterEvents.create.mockRejectedValue(
        new Error('Rate limited'),
      );

      await expect(
        service.reportUsage({
          id: 'cus_123',
          eventName: 'api_calls',
          usage: { quantity: 1 },
        }),
      ).rejects.toThrow('Failed to report usage');
    });
  });

  describe('queryUsage', () => {
    it('queries usage summaries from Stripe', async () => {
      mockStripe.billing.meters.listEventSummaries.mockResolvedValue({
        data: [{ aggregated_value: 50 }, { aggregated_value: 30 }],
      });

      const result = await service.queryUsage({
        id: 'meter_123',
        customerId: 'cus_123',
        filter: { startTime: 1000, endTime: 2000 },
      });

      expect(
        mockStripe.billing.meters.listEventSummaries,
      ).toHaveBeenCalledWith('meter_123', {
        customer: 'cus_123',
        start_time: 1000,
        end_time: 2000,
      });
      expect(result).toEqual({ value: 80 });
    });

    it('throws when filter does not include startTime', async () => {
      await expect(
        service.queryUsage({
          id: 'meter_123',
          customerId: 'cus_123',
          filter: { page: 1, size: 10 } as any,
        }),
      ).rejects.toThrow(
        'Start and end time are required when querying usage',
      );
    });

    it('throws when Stripe API fails', async () => {
      mockStripe.billing.meters.listEventSummaries.mockRejectedValue(
        new Error('API error'),
      );

      await expect(
        service.queryUsage({
          id: 'meter_123',
          customerId: 'cus_123',
          filter: { startTime: 1000, endTime: 2000 },
        }),
      ).rejects.toThrow('Failed to report usage');
    });
  });

  describe('updateSubscriptionItem', () => {
    it('updates the subscription item quantity', async () => {
      mockStripe.subscriptions.update.mockResolvedValue({});

      const result = await service.updateSubscriptionItem({
        subscriptionId: 'sub_123',
        subscriptionItemId: 'si_123',
        quantity: 5,
      });

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_123', {
        items: [{ id: 'si_123', quantity: 5 }],
      });
      expect(result).toEqual({ success: true });
    });

    it('throws when update fails', async () => {
      mockStripe.subscriptions.update.mockRejectedValue(
        new Error('Invalid subscription'),
      );

      await expect(
        service.updateSubscriptionItem({
          subscriptionId: 'sub_123',
          subscriptionItemId: 'si_123',
          quantity: 5,
        }),
      ).rejects.toThrow('Failed to update subscription');
    });
  });

  describe('getPlanById', () => {
    it('retrieves a plan by price ID', async () => {
      mockStripe.prices.retrieve.mockResolvedValue({
        id: 'price_123',
        product: {
          name: 'Starter Plan',
          description: 'Basic plan',
        },
        unit_amount: 999,
        type: 'recurring',
        recurring: { interval: 'month', interval_count: 1 },
      });

      const result = await service.getPlanById('price_123');

      expect(mockStripe.prices.retrieve).toHaveBeenCalledWith('price_123', {
        expand: ['product'],
      });
      expect(result).toEqual({
        id: 'price_123',
        name: 'Starter Plan',
        description: 'Basic plan',
        amount: 9.99,
        type: 'recurring',
        interval: 'month',
        intervalCount: 1,
      });
    });

    it('returns 0 when unit_amount is null', async () => {
      mockStripe.prices.retrieve.mockResolvedValue({
        id: 'price_free',
        product: { name: 'Free', description: '' },
        unit_amount: null,
        type: 'recurring',
        recurring: { interval: 'month' },
      });

      const result = await service.getPlanById('price_free');
      expect(result.amount).toBe(0);
    });

    it('throws when retrieval fails', async () => {
      mockStripe.prices.retrieve.mockRejectedValue(new Error('Not found'));

      await expect(service.getPlanById('price_bad')).rejects.toThrow(
        'Failed to retrieve plan',
      );
    });
  });

  describe('getSubscription', () => {
    it('retrieves and builds subscription payload', async () => {
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
              type: '' as never,
            },
          ],
        },
      };

      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription);
      mockPayloadBuilder.getPeriodStartsAt.mockReturnValue(1704067200);
      mockPayloadBuilder.getPeriodEndsAt.mockReturnValue(1706745600);

      const expectedPayload = {
        target_subscription_id: 'sub_123',
        target_account_id: 'acc-1',
        target_customer_id: 'cus_123',
        billing_provider: 'stripe',
        status: 'active',
        active: true,
        currency: 'usd',
        cancel_at_period_end: false,
        period_starts_at: '2024-01-01T00:00:00.000Z',
        period_ends_at: '2024-02-01T00:00:00.000Z',
        line_items: [],
      };
      mockPayloadBuilder.build.mockReturnValue(expectedPayload);

      const result = await service.getSubscription('sub_123');

      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith(
        'sub_123',
      );
      expect(mockPayloadBuilder.build).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cus_123',
          accountId: 'acc-1',
          id: 'sub_123',
          status: 'active',
        }),
      );
      expect(result).toEqual(expectedPayload);
    });

    it('throws when retrieval fails', async () => {
      mockStripe.subscriptions.retrieve.mockRejectedValue(
        new Error('Not found'),
      );

      await expect(service.getSubscription('sub_bad')).rejects.toThrow(
        'Failed to retrieve subscription',
      );
    });
  });
});
