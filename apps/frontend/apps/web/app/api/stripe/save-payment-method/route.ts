import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@kit/shared/auth/nextauth';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/stripe/save-payment-method
 * 
 * Save the Stripe payment method ID after SetupIntent confirmation
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    // Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { paymentMethodId } = body;

    if (!paymentMethodId) {
      return NextResponse.json(
        { success: false, message: 'Payment method ID is required' },
        { status: 400 }
      );
    }

    // Find the user's personal account
    const account = await prisma.account.findFirst({
      where: {
        primaryOwnerId: session.user.id,
        isPersonalAccount: true,
      },
    });

    if (!account) {
      logger.error(
        { userId: session.user.id },
        '[Payment] Personal account not found'
      );
      return NextResponse.json(
        { success: false, message: 'Account not found' },
        { status: 404 }
      );
    }

    // If we have a Stripe Customer, set this as the default payment method
    const stripeCustomerId = (account as any).stripeCustomerId;
    if (stripeCustomerId) {
      try {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (secretKey) {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(secretKey, {
            apiVersion: '2024-12-18.acacia',
          });

          await stripe.customers.update(stripeCustomerId, {
            invoice_settings: {
              default_payment_method: paymentMethodId,
            },
          });
        }
      } catch (stripeErr) {
        logger.warn(
          { error: stripeErr instanceof Error ? stripeErr.message : stripeErr },
          '[Payment] Failed to set default on Stripe Customer (non-fatal)',
        );
      }
    }

    // Update account with payment method
    await prisma.account.update({
      where: { id: account.id },
      data: {
        stripePaymentMethodId: paymentMethodId,
        paymentMethodVerified: true,
        paymentMethodVerifiedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Payment method saved successfully',
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      },
      '[Payment] Exception while saving payment method'
    );

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to save payment method',
      },
      { status: 500 }
    );
  }
}
