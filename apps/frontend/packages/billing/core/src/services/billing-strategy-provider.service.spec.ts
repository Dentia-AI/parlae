import { BillingStrategyProviderService } from './billing-strategy-provider.service';

class TestBillingStrategy extends BillingStrategyProviderService {
  createBillingPortalSession = jest.fn();
  retrieveCheckoutSession = jest.fn();
  createCheckoutSession = jest.fn();
  cancelSubscription = jest.fn();
  reportUsage = jest.fn();
  queryUsage = jest.fn();
  updateSubscriptionItem = jest.fn();
  getPlanById = jest.fn();
  getSubscription = jest.fn();
}

describe('BillingStrategyProviderService', () => {
  it('can be extended by a concrete implementation', () => {
    const service = new TestBillingStrategy();
    expect(service).toBeInstanceOf(BillingStrategyProviderService);
  });

  it('exposes the expected method interface', () => {
    const service = new TestBillingStrategy();
    const methods = [
      'createBillingPortalSession',
      'retrieveCheckoutSession',
      'createCheckoutSession',
      'cancelSubscription',
      'reportUsage',
      'queryUsage',
      'updateSubscriptionItem',
      'getPlanById',
      'getSubscription',
    ] as const;

    for (const method of methods) {
      expect(typeof service[method]).toBe('function');
    }
  });

  it('delegates method calls to the concrete implementation', async () => {
    const service = new TestBillingStrategy();
    service.createCheckoutSession.mockResolvedValue({
      checkoutToken: 'tok_123',
    });

    const result = await service.createCheckoutSession({} as any);
    expect(result).toEqual({ checkoutToken: 'tok_123' });
    expect(service.createCheckoutSession).toHaveBeenCalled();
  });

  it('allows each method to return a promise', async () => {
    const service = new TestBillingStrategy();

    service.cancelSubscription.mockResolvedValue({ success: true });
    service.reportUsage.mockResolvedValue({ success: true });
    service.queryUsage.mockResolvedValue({ value: 42 });
    service.updateSubscriptionItem.mockResolvedValue({ success: true });
    service.getPlanById.mockResolvedValue({
      id: 'plan-1',
      name: 'Test',
      interval: 'month',
      amount: 10,
      type: 'recurring',
    });

    expect(await service.cancelSubscription({} as any)).toEqual({
      success: true,
    });
    expect(await service.queryUsage({} as any)).toEqual({ value: 42 });
    expect((await service.getPlanById('plan-1')).name).toBe('Test');
  });
});
