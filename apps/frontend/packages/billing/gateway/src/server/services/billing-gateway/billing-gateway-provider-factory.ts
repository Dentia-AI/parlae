import 'server-only';

import { prisma } from '@kit/prisma';

import { createBillingGatewayService } from './billing-gateway.service';

/**
 * @description Retrieves the configured billing provider and returns a billing gateway service instance.
 */
export async function getBillingGatewayProvider() {
  const config = await prisma.config.findFirst({
    select: {
      billingProvider: true,
    },
  });

  if (!config?.billingProvider) {
    throw new Error(
      'Billing provider configuration was not found. Ensure the config table is seeded.',
    );
  }

  return createBillingGatewayService(
    config.billingProvider.toLowerCase() as 'stripe',
  );
}
