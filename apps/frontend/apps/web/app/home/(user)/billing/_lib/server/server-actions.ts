'use server';

import { redirect } from 'next/navigation';

import { enhanceAction } from '@kit/next/actions';

import featureFlagsConfig from '~/config/feature-flags.config';

import { PersonalAccountCheckoutSchema } from '../schema/personal-account-checkout.schema';
import { createUserBillingService } from './user-billing.service';

/**
 * @name enabled
 * @description This feature flag is used to enable or disable personal account billing.
 */
const enabled = featureFlagsConfig.enablePersonalAccountBilling;

/**
 * @name createPersonalAccountCheckoutSession
 * @description Creates a checkout session for a personal account.
 */
export const createPersonalAccountCheckoutSession = enhanceAction(
  async function (data) {
    if (!enabled) {
      throw new Error('Personal account billing is not enabled');
    }

    const service = createUserBillingService();

    return await service.createCheckoutSession(data);
  },
  {
    schema: PersonalAccountCheckoutSchema,
  },
);

/**
 * @name createPersonalAccountBillingPortalSession
 * @description Creates a billing Portal session for a personal account
 */
export const createPersonalAccountBillingPortalSession = enhanceAction(
  async () => {
    if (!enabled) {
      throw new Error('Personal account billing is not enabled');
    }

    const service = createUserBillingService();

    // get url to billing portal
    const url = await service.createBillingPortalSession();

    return redirect(url);
  },
  {},
);
