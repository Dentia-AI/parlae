export const createMockStripeClient = () => ({
  checkout: {
    sessions: {
      create: jest.fn().mockResolvedValue({
        id: 'cs_test_123',
        client_secret: 'cs_secret_123',
        url: 'https://checkout.stripe.com/test',
      }),
    },
  },
  refunds: {
    create: jest.fn().mockResolvedValue({
      id: 're_test_123',
      amount: 1000,
      status: 'succeeded',
    }),
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
  customers: {
    list: jest.fn().mockResolvedValue({ data: [] }),
    create: jest.fn().mockResolvedValue({ id: 'cus_test_123' }),
    retrieve: jest.fn().mockResolvedValue({
      id: 'cus_test_123',
      invoice_settings: { default_payment_method: 'pm_test_123' },
    }),
  },
  paymentIntents: {
    create: jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      status: 'succeeded',
    }),
  },
  paymentMethods: {
    list: jest.fn().mockResolvedValue({
      data: [{ id: 'pm_test_123' }],
    }),
  },
});

export const createMockStripeService = () => {
  const mockClient = createMockStripeClient();
  return {
    getClient: jest.fn().mockReturnValue(mockClient),
    getWebhookSecret: jest.fn().mockReturnValue('whsec_test_123'),
    onModuleInit: jest.fn(),
    _mockClient: mockClient,
  };
};
