jest.mock('@kit/billing/schema', () => ({
  CreateBillingCheckoutSchema: { parse: jest.fn((x: any) => x) },
  RetrieveCheckoutSessionSchema: { parse: jest.fn((x: any) => x) },
  CreateBillingPortalSessionSchema: { parse: jest.fn((x: any) => x) },
  CancelSubscriptionParamsSchema: { parse: jest.fn((x: any) => x) },
  ReportBillingUsageSchema: { parse: jest.fn((x: any) => x) },
  QueryBillingUsageSchema: { parse: jest.fn((x: any) => x) },
  UpdateSubscriptionParamsSchema: { parse: jest.fn((x: any) => x) },
}));

jest.mock('./billing-gateway-registry', () => ({
  billingStrategyRegistry: {
    get: jest.fn(),
  },
}));

import { createBillingGatewayService } from './billing-gateway.service';
import { billingStrategyRegistry } from './billing-gateway-registry';

const mockGet = billingStrategyRegistry.get as jest.Mock;

describe('BillingGatewayService', () => {
  const mockStrategy = {
    createCheckoutSession: jest.fn(),
    retrieveCheckoutSession: jest.fn(),
    createBillingPortalSession: jest.fn(),
    cancelSubscription: jest.fn(),
    reportUsage: jest.fn(),
    queryUsage: jest.fn(),
    getPlanById: jest.fn(),
    updateSubscriptionItem: jest.fn(),
    getSubscription: jest.fn(),
  };

  const service = createBillingGatewayService('stripe');

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(mockStrategy);
  });

  describe('createCheckoutSession', () => {
    it('delegates to the strategy after schema parsing', async () => {
      const params = {
        returnUrl: 'http://localhost/return',
        accountId: 'acc-1',
        plan: {},
        variantQuantities: [],
      };
      mockStrategy.createCheckoutSession.mockResolvedValue({
        checkoutToken: 'cs_123',
      });

      const result = await service.createCheckoutSession(params as any);

      expect(mockGet).toHaveBeenCalledWith('stripe');
      expect(mockStrategy.createCheckoutSession).toHaveBeenCalledWith(params);
      expect(result).toEqual({ checkoutToken: 'cs_123' });
    });
  });

  describe('retrieveCheckoutSession', () => {
    it('delegates to the strategy', async () => {
      const params = { sessionId: 'sess_123' };
      mockStrategy.retrieveCheckoutSession.mockResolvedValue({
        checkoutToken: 'secret',
        status: 'complete',
        isSessionOpen: false,
        customer: { email: 'test@example.com' },
      });

      const result = await service.retrieveCheckoutSession(params);
      expect(mockStrategy.retrieveCheckoutSession).toHaveBeenCalledWith(params);
      expect(result.status).toBe('complete');
    });
  });

  describe('createBillingPortalSession', () => {
    it('delegates to the strategy', async () => {
      const params = {
        returnUrl: 'http://localhost/return',
        customerId: 'cus_123',
      };
      mockStrategy.createBillingPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/portal',
      });

      const result = await service.createBillingPortalSession(params);
      expect(mockStrategy.createBillingPortalSession).toHaveBeenCalledWith(
        params,
      );
      expect(result.url).toBe('https://billing.stripe.com/portal');
    });
  });

  describe('cancelSubscription', () => {
    it('delegates to the strategy', async () => {
      const params = { subscriptionId: 'sub_123' };
      mockStrategy.cancelSubscription.mockResolvedValue({ success: true });

      const result = await service.cancelSubscription(params);
      expect(mockStrategy.cancelSubscription).toHaveBeenCalledWith(params);
      expect(result).toEqual({ success: true });
    });
  });

  describe('reportUsage', () => {
    it('delegates to the strategy', async () => {
      const params = {
        id: 'cus_123',
        eventName: 'api_call',
        usage: { quantity: 5 },
      };
      mockStrategy.reportUsage.mockResolvedValue({ success: true });

      const result = await service.reportUsage(params);
      expect(mockStrategy.reportUsage).toHaveBeenCalledWith(params);
      expect(result).toEqual({ success: true });
    });
  });

  describe('queryUsage', () => {
    it('delegates to the strategy', async () => {
      const params = {
        id: 'meter_123',
        customerId: 'cus_123',
        filter: { startTime: 1000, endTime: 2000 },
      };
      mockStrategy.queryUsage.mockResolvedValue({ value: 42 });

      const result = await service.queryUsage(params);
      expect(mockStrategy.queryUsage).toHaveBeenCalledWith(params);
      expect(result).toEqual({ value: 42 });
    });
  });

  describe('getPlanById', () => {
    it('delegates to the strategy without schema parsing', async () => {
      mockStrategy.getPlanById.mockResolvedValue({
        id: 'price_123',
        name: 'Starter',
        interval: 'month',
        amount: 10,
        type: 'recurring',
      });

      const result = await service.getPlanById('price_123');
      expect(mockStrategy.getPlanById).toHaveBeenCalledWith('price_123');
      expect(result.name).toBe('Starter');
    });
  });

  describe('updateSubscriptionItem', () => {
    it('delegates to the strategy', async () => {
      const params = {
        subscriptionId: 'sub_123',
        subscriptionItemId: 'si_123',
        quantity: 5,
      };
      mockStrategy.updateSubscriptionItem.mockResolvedValue({ success: true });

      const result = await service.updateSubscriptionItem(params);
      expect(mockStrategy.updateSubscriptionItem).toHaveBeenCalledWith(params);
      expect(result).toEqual({ success: true });
    });
  });

  describe('getSubscription', () => {
    it('delegates to the strategy', async () => {
      const mockSubscription = {
        target_subscription_id: 'sub_123',
        target_account_id: 'acc-1',
        target_customer_id: 'cus_123',
        billing_provider: 'stripe',
        status: 'active',
        active: true,
        currency: 'usd',
        cancel_at_period_end: false,
        period_starts_at: '2024-01-01T00:00:00Z',
        period_ends_at: '2024-02-01T00:00:00Z',
        line_items: [],
      };
      mockStrategy.getSubscription.mockResolvedValue(mockSubscription);

      const result = await service.getSubscription('sub_123');
      expect(mockStrategy.getSubscription).toHaveBeenCalledWith('sub_123');
      expect(result.target_subscription_id).toBe('sub_123');
    });
  });
});
