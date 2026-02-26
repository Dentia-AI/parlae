import { NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * GET /api/stripe/payment-method
 *
 * Returns the current payment method details (brand, last4, expiry)
 * for the authenticated user's account.
 */
export async function GET() {
  const logger = await getLogger();

  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: session.id, isPersonalAccount: true },
      select: {
        stripeCustomerId: true,
        stripePaymentMethodId: true,
        paymentMethodVerified: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (!account.stripeCustomerId || !account.stripePaymentMethodId) {
      return NextResponse.json({
        hasPaymentMethod: false,
        card: null,
      });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });

    try {
      const pm = await stripe.paymentMethods.retrieve(account.stripePaymentMethodId);

      if (pm.card) {
        return NextResponse.json({
          hasPaymentMethod: true,
          card: {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          },
        });
      }
    } catch (stripeErr) {
      logger.warn(
        { error: stripeErr instanceof Error ? stripeErr.message : stripeErr },
        '[Billing] Failed to retrieve payment method from Stripe',
      );
    }

    return NextResponse.json({
      hasPaymentMethod: account.paymentMethodVerified,
      card: null,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      '[Billing] Exception fetching payment method',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
