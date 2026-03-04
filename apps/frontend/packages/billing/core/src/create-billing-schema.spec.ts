import {
  createBillingSchema,
  getPlanIntervals,
  getPrimaryLineItem,
  getProductPlanPair,
  getProductPlanPairByVariantId,
  getPlanTypesMap,
  LineItemType,
} from './create-billing-schema';

function createValidConfig() {
  return {
    provider: 'stripe' as const,
    products: [
      {
        id: 'prod-starter',
        name: 'Starter',
        description: 'Basic plan',
        currency: 'usd',
        features: ['Feature A'],
        plans: [
          {
            id: 'plan-starter-monthly',
            name: 'Monthly',
            interval: 'month' as const,
            paymentType: 'recurring' as const,
            lineItems: [
              { id: 'li-1', name: 'Base', cost: 10, type: 'flat' as const },
            ],
          },
          {
            id: 'plan-starter-yearly',
            name: 'Yearly',
            interval: 'year' as const,
            paymentType: 'recurring' as const,
            lineItems: [
              { id: 'li-2', name: 'Base', cost: 100, type: 'flat' as const },
            ],
          },
        ],
      },
      {
        id: 'prod-pro',
        name: 'Pro',
        description: 'Pro plan',
        currency: 'usd',
        features: ['Feature A', 'Feature B'],
        plans: [
          {
            id: 'plan-pro-monthly',
            name: 'Monthly',
            interval: 'month' as const,
            paymentType: 'recurring' as const,
            lineItems: [
              { id: 'li-3', name: 'Base', cost: 30, type: 'flat' as const },
              {
                id: 'li-4',
                name: 'Seats',
                cost: 5,
                type: 'per_seat' as const,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('createBillingSchema', () => {
  it('validates and returns a valid config', () => {
    const config = createValidConfig();
    const result = createBillingSchema(config);
    expect(result.provider).toBe('stripe');
    expect(result.products).toHaveLength(2);
  });

  it('throws on invalid provider', () => {
    const config = { ...createValidConfig(), provider: 'invalid' as any };
    expect(() => createBillingSchema(config)).toThrow();
  });

  it('throws when products array is empty', () => {
    const config = { ...createValidConfig(), products: [] as any };
    expect(() => createBillingSchema(config)).toThrow();
  });

  it('throws when line item IDs are not unique across products', () => {
    const config = createValidConfig();
    config.products[1]!.plans[0]!.lineItems[0]!.id = 'li-1';
    expect(() => createBillingSchema(config)).toThrow();
  });

  it('throws when a recurring plan has no interval', () => {
    const config = createValidConfig();
    delete (config.products[0]!.plans[0] as any).interval;
    expect(() => createBillingSchema(config)).toThrow();
  });

  it('throws when a one-time plan has an interval', () => {
    const config = {
      provider: 'stripe' as const,
      products: [
        {
          id: 'prod-1',
          name: 'Product',
          description: 'Desc',
          currency: 'usd',
          features: ['F1'],
          plans: [
            {
              id: 'plan-1',
              name: 'One-time',
              interval: 'month' as const,
              paymentType: 'one-time' as const,
              lineItems: [
                { id: 'li-ot', name: 'Item', cost: 50, type: 'flat' as const },
              ],
            },
          ],
        },
      ],
    };
    expect(() => createBillingSchema(config)).toThrow();
  });

  it('validates a one-time payment plan without interval', () => {
    const config = {
      provider: 'stripe' as const,
      products: [
        {
          id: 'prod-1',
          name: 'Product',
          description: 'Desc',
          currency: 'usd',
          features: ['F1'],
          plans: [
            {
              id: 'plan-1',
              name: 'One-time',
              paymentType: 'one-time' as const,
              lineItems: [
                { id: 'li-ot', name: 'Item', cost: 50, type: 'flat' as const },
              ],
            },
          ],
        },
      ],
    };
    const result = createBillingSchema(config);
    expect(result.products[0]!.plans[0]!.paymentType).toBe('one-time');
  });

  it('throws when one-time plan has non-flat line items', () => {
    const config = {
      provider: 'stripe' as const,
      products: [
        {
          id: 'prod-1',
          name: 'Product',
          description: 'Desc',
          currency: 'usd',
          features: ['F1'],
          plans: [
            {
              id: 'plan-1',
              name: 'One-time',
              paymentType: 'one-time' as const,
              lineItems: [
                {
                  id: 'li-ot',
                  name: 'Seat',
                  cost: 5,
                  type: 'per_seat' as const,
                },
              ],
            },
          ],
        },
      ],
    };
    expect(() => createBillingSchema(config)).toThrow();
  });

  it('throws when non-custom plan has no line items', () => {
    const config = {
      provider: 'stripe' as const,
      products: [
        {
          id: 'prod-1',
          name: 'Product',
          description: 'Desc',
          currency: 'usd',
          features: ['F1'],
          plans: [
            {
              id: 'plan-1',
              name: 'Empty',
              interval: 'month' as const,
              paymentType: 'recurring' as const,
              lineItems: [],
            },
          ],
        },
      ],
    };
    expect(() => createBillingSchema(config)).toThrow();
  });

  it('validates a custom plan with zero line items', () => {
    const config = {
      provider: 'stripe' as const,
      products: [
        {
          id: 'prod-1',
          name: 'Product',
          description: 'Desc',
          currency: 'usd',
          features: ['F1'],
          plans: [
            {
              id: 'plan-custom',
              name: 'Custom',
              interval: 'month' as const,
              paymentType: 'recurring' as const,
              custom: true,
              lineItems: [],
            },
          ],
        },
      ],
    };
    const result = createBillingSchema(config);
    expect(result.products[0]!.plans[0]!.custom).toBe(true);
  });
});

describe('getPlanIntervals', () => {
  it('returns unique intervals from all plans', () => {
    const config = createBillingSchema(createValidConfig());
    const intervals = getPlanIntervals(config);
    expect(intervals).toContain('month');
    expect(intervals).toContain('year');
    expect(intervals).toHaveLength(2);
  });

  it('deduplicates intervals when multiple plans share an interval', () => {
    const config = createBillingSchema(createValidConfig());
    const intervals = getPlanIntervals(config);
    const monthCount = intervals.filter((i) => i === 'month').length;
    expect(monthCount).toBe(1);
  });

  it('returns empty array when all plans are one-time', () => {
    const config = createBillingSchema({
      provider: 'stripe',
      products: [
        {
          id: 'prod-1',
          name: 'Product',
          description: 'Desc',
          currency: 'usd',
          features: ['F1'],
          plans: [
            {
              id: 'plan-1',
              name: 'One-time',
              paymentType: 'one-time' as const,
              lineItems: [
                { id: 'li-1', name: 'Item', cost: 50, type: 'flat' as const },
              ],
            },
          ],
        },
      ],
    });
    const intervals = getPlanIntervals(config);
    expect(intervals).toHaveLength(0);
  });
});

describe('getPrimaryLineItem', () => {
  it('returns the flat line item when present', () => {
    const config = createBillingSchema(createValidConfig());
    const lineItem = getPrimaryLineItem(config, 'plan-pro-monthly');
    expect(lineItem.type).toBe('flat');
    expect(lineItem.id).toBe('li-3');
  });

  it('returns the first line item when no flat item exists', () => {
    const config = createBillingSchema({
      provider: 'stripe',
      products: [
        {
          id: 'prod-1',
          name: 'Product',
          description: 'Desc',
          currency: 'usd',
          features: ['F1'],
          plans: [
            {
              id: 'plan-seats',
              name: 'Per Seat',
              interval: 'month' as const,
              paymentType: 'recurring' as const,
              lineItems: [
                {
                  id: 'li-seat',
                  name: 'Seat',
                  cost: 5,
                  type: 'per_seat' as const,
                },
              ],
            },
          ],
        },
      ],
    });
    const lineItem = getPrimaryLineItem(config, 'plan-seats');
    expect(lineItem.id).toBe('li-seat');
    expect(lineItem.type).toBe('per_seat');
  });

  it('throws when plan is not found', () => {
    const config = createBillingSchema(createValidConfig());
    expect(() => getPrimaryLineItem(config, 'non-existent')).toThrow(
      'Base line item not found',
    );
  });

  it('prefers flat over per_seat in mixed plans', () => {
    const config = createBillingSchema(createValidConfig());
    const lineItem = getPrimaryLineItem(config, 'plan-pro-monthly');
    expect(lineItem.type).toBe(LineItemType.Flat);
  });
});

describe('getProductPlanPair', () => {
  it('returns the matching product and plan', () => {
    const config = createBillingSchema(createValidConfig());
    const { product, plan } = getProductPlanPair(config, 'plan-pro-monthly');
    expect(product.id).toBe('prod-pro');
    expect(plan.id).toBe('plan-pro-monthly');
  });

  it('finds plans in the first product', () => {
    const config = createBillingSchema(createValidConfig());
    const { product, plan } = getProductPlanPair(
      config,
      'plan-starter-monthly',
    );
    expect(product.id).toBe('prod-starter');
    expect(plan.id).toBe('plan-starter-monthly');
  });

  it('throws when plan is not found', () => {
    const config = createBillingSchema(createValidConfig());
    expect(() => getProductPlanPair(config, 'non-existent')).toThrow(
      'Plan not found',
    );
  });
});

describe('getProductPlanPairByVariantId', () => {
  it('returns the matching product and plan by line item id', () => {
    const config = createBillingSchema(createValidConfig());
    const { product, plan } = getProductPlanPairByVariantId(config, 'li-3');
    expect(product.id).toBe('prod-pro');
    expect(plan.id).toBe('plan-pro-monthly');
  });

  it('finds line items in the first product', () => {
    const config = createBillingSchema(createValidConfig());
    const { product, plan } = getProductPlanPairByVariantId(config, 'li-1');
    expect(product.id).toBe('prod-starter');
    expect(plan.id).toBe('plan-starter-monthly');
  });

  it('throws when variant is not found', () => {
    const config = createBillingSchema(createValidConfig());
    expect(() =>
      getProductPlanPairByVariantId(config, 'non-existent'),
    ).toThrow('Plan not found');
  });
});

describe('getPlanTypesMap', () => {
  it('returns a map of all line item types keyed by id', () => {
    const config = createBillingSchema(createValidConfig());
    const typesMap = getPlanTypesMap(config);
    expect(typesMap.get('li-1')).toBe('flat');
    expect(typesMap.get('li-2')).toBe('flat');
    expect(typesMap.get('li-3')).toBe('flat');
    expect(typesMap.get('li-4')).toBe('per_seat');
  });

  it('includes all line items across all products and plans', () => {
    const config = createBillingSchema(createValidConfig());
    const typesMap = getPlanTypesMap(config);
    expect(typesMap.size).toBe(4);
  });

  it('returns an empty map when no line items exist', () => {
    const config = createBillingSchema({
      provider: 'stripe',
      products: [
        {
          id: 'prod-1',
          name: 'Product',
          description: 'Desc',
          currency: 'usd',
          features: ['F1'],
          plans: [
            {
              id: 'plan-custom',
              name: 'Custom',
              interval: 'month' as const,
              paymentType: 'recurring' as const,
              custom: true,
              lineItems: [],
            },
          ],
        },
      ],
    });
    const typesMap = getPlanTypesMap(config);
    expect(typesMap.size).toBe(0);
  });
});
