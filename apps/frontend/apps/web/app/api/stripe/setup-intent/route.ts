import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';

/**
 * POST /api/stripe/setup-intent
 *
 * Creates a Stripe SetupIntent for collecting payment method details.
 * If the user doesn't have a Stripe Customer yet, one is created and stored.
 * Passing the customer ID allows the Payment Element to show previously
 * saved cards and enables Stripe Link autofill.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500 },
      );
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(secretKey, {
      apiVersion: '2024-12-18.acacia',
    });

    // Get the user's account
    const account = await prisma.account.findFirst({
      where: {
        primaryOwnerId: session.id,
        isPersonalAccount: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 },
      );
    }

    // Create or retrieve Stripe Customer
    // Use a raw query to safely read stripeCustomerId (column may not exist yet if migration pending)
    let customerId: string | null = null;
    try {
      const fullAccount = await prisma.account.findUnique({
        where: { id: account.id },
      });
      customerId = (fullAccount as any)?.stripeCustomerId ?? null;
    } catch {
      // Column may not exist yet
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: account.name,
        email: account.email ?? undefined,
        metadata: {
          accountId: account.id,
          userId: session.id,
        },
      });

      customerId = customer.id;

      try {
        await prisma.account.update({
          where: { id: account.id },
          data: { stripeCustomerId: customerId } as any,
        });
      } catch {
        console.warn('Could not save stripeCustomerId (migration may be pending)');
      }
    }

    // Create a SetupIntent attached to the customer
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: {
        accountId: account.id,
        userId: session.id,
      },
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId,
      success: true,
    });
  } catch (error) {
    console.error('Error creating SetupIntent:', error);
    return NextResponse.json(
      { error: 'Failed to create setup intent' },
      { status: 500 },
    );
  }
}
