import 'server-only';

import type { PlanTypeMap } from '@kit/billing';
import { BillingProvider } from '@kit/billing/types';

import { createBillingEventHandlerFactoryService } from './billing-event-handler-factory.service';
import { createBillingEventHandlerService } from './billing-event-handler.service';

/**
 * @name getBillingEventHandlerService
 * @description This function retrieves the billing provider from the database and returns a
 * new instance of the `BillingGatewayService` class. This class is used to interact with the server actions
 * defined in the host application.
 */
export async function getBillingEventHandlerService(
  provider: BillingProvider,
  planTypesMap: PlanTypeMap,
) {
  const strategy =
    await createBillingEventHandlerFactoryService(planTypesMap).get(provider);

  return createBillingEventHandlerService(strategy);
}
