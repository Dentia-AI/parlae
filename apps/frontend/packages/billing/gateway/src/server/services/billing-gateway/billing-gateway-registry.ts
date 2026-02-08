import 'server-only';

import { z } from 'zod';

import {
  type BillingProviderSchema,
  BillingStrategyProviderService,
} from '@kit/billing';
import { createRegistry } from '@kit/shared/registry';

// Create a registry for billing strategy providers
export const billingStrategyRegistry = createRegistry<
  BillingStrategyProviderService,
  z.infer<typeof BillingProviderSchema>
>();

// Register the Stripe billing strategy
billingStrategyRegistry.register('stripe', async () => {
  const { StripeBillingStrategyService } = await import('@kit/stripe');
  return new StripeBillingStrategyService();
});
