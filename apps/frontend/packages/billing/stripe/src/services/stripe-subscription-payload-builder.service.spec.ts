jest.mock('@kit/billing/types', () => ({}));

import { createStripeSubscriptionPayloadBuilderService } from './stripe-subscription-payload-builder.service';

describe('StripeSubscriptionPayloadBuilderService', () => {
  const builder = createStripeSubscriptionPayloadBuilderService();

  describe('build', () => {
    const baseParams = {
      id: 'sub_123',
      accountId: 'acc-1',
      customerId: 'cus_123',
      lineItems: [
        {
          id: 'si_1',
          quantity: 2,
          price: {
            id: 'price_1',
            product: 'prod_1',
            unit_amount: 1000,
            recurring: { interval: 'month', interval_count: 1 },
          },
          type: 'flat' as const,
        },
      ],
      status: 'active' as const,
      currency: 'usd',
      cancelAtPeriodEnd: false,
      periodStartsAt: 1704067200,
      periodEndsAt: 1706745600,
      trialStartsAt: null,
      trialEndsAt: null,
    };

    it('builds the correct subscription payload', () => {
      const result = builder.build(baseParams);

      expect(result.target_subscription_id).toBe('sub_123');
      expect(result.target_account_id).toBe('acc-1');
      expect(result.target_customer_id).toBe('cus_123');
      expect(result.billing_provider).toBe('stripe');
      expect(result.status).toBe('active');
      expect(result.active).toBe(true);
      expect(result.currency).toBe('usd');
      expect(result.cancel_at_period_end).toBe(false);
      expect(result.period_starts_at).toBe(
        new Date(1704067200 * 1000).toISOString(),
      );
      expect(result.period_ends_at).toBe(
        new Date(1706745600 * 1000).toISOString(),
      );
      expect(result.trial_starts_at).toBeUndefined();
      expect(result.trial_ends_at).toBeUndefined();
      expect(result.line_items).toHaveLength(1);
      expect(result.line_items[0]).toEqual(
        expect.objectContaining({
          id: 'si_1',
          quantity: 2,
          subscription_id: 'sub_123',
          subscription_item_id: 'si_1',
          product_id: 'prod_1',
          variant_id: 'price_1',
          price_amount: 1000,
          interval: 'month',
          interval_count: 1,
          type: 'flat',
        }),
      );
    });

    it('sets active to true for active subscriptions', () => {
      const result = builder.build({ ...baseParams, status: 'active' });
      expect(result.active).toBe(true);
    });

    it('sets active to true for trialing subscriptions', () => {
      const result = builder.build({ ...baseParams, status: 'trialing' });
      expect(result.active).toBe(true);
    });

    it('sets active to false for canceled subscriptions', () => {
      const result = builder.build({ ...baseParams, status: 'canceled' });
      expect(result.active).toBe(false);
    });

    it('sets active to false for past_due subscriptions', () => {
      const result = builder.build({ ...baseParams, status: 'past_due' });
      expect(result.active).toBe(false);
    });

    it('sets active to false for unpaid subscriptions', () => {
      const result = builder.build({ ...baseParams, status: 'unpaid' });
      expect(result.active).toBe(false);
    });

    it('includes trial dates when provided', () => {
      const result = builder.build({
        ...baseParams,
        trialStartsAt: 1704067200,
        trialEndsAt: 1705276800,
      });

      expect(result.trial_starts_at).toBe('2024-01-01T00:00:00.000Z');
      expect(result.trial_ends_at).toBe('2024-01-15T00:00:00.000Z');
    });

    it('sets trial dates to undefined when null', () => {
      const result = builder.build(baseParams);

      expect(result.trial_starts_at).toBeUndefined();
      expect(result.trial_ends_at).toBeUndefined();
    });

    it('defaults quantity to 1 when not specified', () => {
      const params = {
        ...baseParams,
        lineItems: [
          {
            id: 'si_1',
            price: {
              id: 'price_1',
              product: 'prod_1',
              unit_amount: 1000,
              recurring: { interval: 'month', interval_count: 1 },
            },
            type: 'flat' as const,
          },
        ],
      };

      const result = builder.build(params);
      expect(result.line_items[0]!.quantity).toBe(1);
    });

    it('maps multiple line items', () => {
      const params = {
        ...baseParams,
        lineItems: [
          {
            id: 'si_1',
            quantity: 1,
            price: {
              id: 'price_1',
              product: 'prod_1',
              unit_amount: 1000,
              recurring: { interval: 'month', interval_count: 1 },
            },
            type: 'flat' as const,
          },
          {
            id: 'si_2',
            quantity: 5,
            price: {
              id: 'price_2',
              product: 'prod_1',
              unit_amount: 500,
              recurring: { interval: 'month', interval_count: 1 },
            },
            type: 'per_seat' as const,
          },
        ],
      };

      const result = builder.build(params);
      expect(result.line_items).toHaveLength(2);
      expect(result.line_items[0]!.type).toBe('flat');
      expect(result.line_items[1]!.type).toBe('per_seat');
      expect(result.line_items[1]!.quantity).toBe(5);
    });

    it('preserves cancel_at_period_end flag', () => {
      const result = builder.build({
        ...baseParams,
        cancelAtPeriodEnd: true,
      });

      expect(result.cancel_at_period_end).toBe(true);
    });

    it('defaults cancel_at_period_end to false when undefined', () => {
      const result = builder.build({
        ...baseParams,
        cancelAtPeriodEnd: undefined as any,
      });

      expect(result.cancel_at_period_end).toBe(false);
    });
  });

  describe('getPeriodStartsAt', () => {
    it('returns current_period_start for Stripe <= 17', () => {
      const subscription = {
        current_period_start: 1704067200,
        items: { data: [{ current_period_start: 9999 }] },
      };

      const result = builder.getPeriodStartsAt(subscription as any);
      expect(result).toBe(1704067200);
    });

    it('falls back to subscription item period for Stripe 18+', () => {
      const subscription = {
        items: { data: [{ current_period_start: 1704067200 }] },
      };

      const result = builder.getPeriodStartsAt(subscription as any);
      expect(result).toBe(1704067200);
    });
  });

  describe('getPeriodEndsAt', () => {
    it('returns current_period_end for Stripe <= 17', () => {
      const subscription = {
        current_period_end: 1706745600,
        items: { data: [{ current_period_end: 9999 }] },
      };

      const result = builder.getPeriodEndsAt(subscription as any);
      expect(result).toBe(1706745600);
    });

    it('falls back to subscription item period for Stripe 18+', () => {
      const subscription = {
        items: { data: [{ current_period_end: 1706745600 }] },
      };

      const result = builder.getPeriodEndsAt(subscription as any);
      expect(result).toBe(1706745600);
    });
  });
});
