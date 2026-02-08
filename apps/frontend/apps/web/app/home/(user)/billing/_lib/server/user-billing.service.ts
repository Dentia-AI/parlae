import 'server-only';

import { z } from 'zod';

import { getProductPlanPair } from '@kit/billing';
import { getBillingGatewayProvider } from '@kit/billing-gateway';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

import appConfig from '~/config/app.config';
import billingConfig from '~/config/billing.config';
import pathsConfig from '~/config/paths.config';
import { auth } from '@kit/shared/auth';

import { PersonalAccountCheckoutSchema } from '../schema/personal-account-checkout.schema';

export function createUserBillingService() {
  return new UserBillingService();
}

class UserBillingService {
  private readonly namespace = 'billing.personal-account';

  constructor(private readonly db = prisma) {}

  async createCheckoutSession({
    planId,
    productId,
  }: z.infer<typeof PersonalAccountCheckoutSchema>) {
    const user = await this.requireUser();
    const account = await this.requirePersonalAccount(user.id);
    const logger = await getLogger();

    const product = billingConfig.products.find((item) => item.id === productId);

    if (!product) {
      throw new Error('Product not found');
    }

    const { plan } = getProductPlanPair(billingConfig, planId);
    const service = await getBillingGatewayProvider();
    const returnUrl = getCheckoutSessionReturnUrl();

    const customer = await this.db.billingCustomer.findFirst({
      where: {
        accountId: account.id,
        provider: 'STRIPE',
      },
      select: {
        customerId: true,
      },
    });

    const ctx = {
      name: this.namespace,
      planId,
      accountId: account.id,
      customerId: customer?.customerId,
    };

    logger.info(
      ctx,
      'User requested a personal account checkout session. Contacting provider...',
    );

    try {
      const { checkoutToken } = await service.createCheckoutSession({
        accountId: account.id,
        customerId: customer?.customerId,
        customerEmail: user.email,
        returnUrl,
        plan,
        enableDiscountField: product.enableDiscountField,
        variantQuantities: [],
      });

      logger.info(ctx, 'Checkout session created successfully');

      return { checkoutToken };
    } catch (error) {
      logger.error({ ...ctx, error }, 'Failed to create checkout session');

      throw new Error('Failed to create a checkout session');
    }
  }

  async createBillingPortalSession() {
    const user = await this.requireUser();
    const account = await this.requirePersonalAccount(user.id);
    const logger = await getLogger();

    const customer = await this.db.billingCustomer.findFirst({
      where: {
        accountId: account.id,
        provider: 'STRIPE',
      },
      select: {
        customerId: true,
      },
    });

    if (!customer?.customerId) {
      throw new Error('Customer not found');
    }

    const ctx = {
      name: this.namespace,
      accountId: account.id,
      customerId: customer.customerId,
    };

    logger.info(ctx, 'Creating billing portal session...');

    try {
      const service = await getBillingGatewayProvider();
      const returnUrl = getBillingPortalReturnUrl();

      const session = await service.createBillingPortalSession({
        customerId: customer.customerId,
        returnUrl,
      });

      logger.info(ctx, 'Billing portal session created successfully');

      return session.url;
    } catch (error) {
      logger.error({ ...ctx, error }, 'Failed to create billing portal session');

      throw new Error('Encountered an error creating the Billing Portal session');
    }
  }

  private async requireUser() {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error('Authentication required');
    }

    return {
      id: session.user.id as string,
      email: session.user.email ?? undefined,
    };
  }

  private async requirePersonalAccount(userId: string) {
    const account = await this.db.account.findFirst({
      where: {
        primaryOwnerId: userId,
        isPersonalAccount: true,
      },
      select: {
        id: true,
      },
    });

    if (!account) {
      throw new Error('Personal account not found');
    }

    return account;
  }
}

function getCheckoutSessionReturnUrl() {
  return new URL(
    pathsConfig.app.personalAccountBillingReturn,
    appConfig.url,
  ).toString();
}

function getBillingPortalReturnUrl() {
  return new URL(
    pathsConfig.app.personalAccountBilling,
    appConfig.url,
  ).toString();
}
