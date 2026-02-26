import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/stripe/billing-portal
 *
 * Creates a Stripe Customer Portal session for the authenticated user.
 * The portal lets customers update their payment method and view invoices.
 *
 * Body (optional): { flow?: 'payment_method_update' }
 *   - If flow is 'payment_method_update', opens the portal directly on the
 *     payment method update screen.
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const flow = body.flow as string | undefined;

    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: session.id, isPersonalAccount: true },
      select: { id: true, stripeCustomerId: true, name: true, email: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });

    let customerId = account.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: account.name,
        email: account.email ?? undefined,
        metadata: { accountId: account.id, userId: session.id },
      });
      customerId = customer.id;

      await prisma.account.update({
        where: { id: account.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const returnUrl = `${request.nextUrl.origin}/home/settings/billing`;

    const portalParams: Record<string, unknown> = {
      customer: customerId,
      return_url: returnUrl,
    };

    if (flow === 'payment_method_update') {
      (portalParams as any).flow_data = {
        type: 'payment_method_update',
      };
    }

    const portalSession = await stripe.billingPortal.sessions.create(
      portalParams as any,
    );

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      '[Billing] Exception creating billing portal session',
    );
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
