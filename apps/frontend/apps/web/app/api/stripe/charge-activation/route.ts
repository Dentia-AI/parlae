import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { auth } from '@kit/shared/auth/nextauth';

/**
 * Charges the activation fee when the user deploys their AI receptionist.
 *
 * This creates a Stripe PaymentIntent using the saved payment method
 * and charges it immediately. The amount is configurable per-clinic
 * by admin, or falls back to ACTIVATION_FEE_CENTS env var (default $5).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500 },
      );
    }

    const account = await prisma.account.findFirst({
      where: {
        primaryOwnerId: session.user.id,
        isPersonalAccount: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 },
      );
    }

    if (!account.stripePaymentMethodId) {
      return NextResponse.json(
        { error: 'No payment method on file. Please add a card first.' },
        { status: 400 },
      );
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(secretKey, {
      apiVersion: '2024-12-18.acacia',
    });

    // Pull installation fee from admin-configured billing config, fall back to env/default
    const publicData = (account.publicData as Record<string, unknown>) ?? {};
    const billingConfig = publicData.billingConfig as Record<string, unknown> | undefined;
    const adminInstallFee = billingConfig?.installationFee as number | undefined;
    const activationFeeCents = adminInstallFee
      ? Math.round(adminInstallFee * 100)
      : parseInt(process.env.ACTIVATION_FEE_CENTS || '500', 10);

    // Create and confirm a PaymentIntent for the activation fee
    const paymentIntent = await stripe.paymentIntents.create({
      amount: activationFeeCents,
      currency: 'cad',
      customer: (account as any).stripeCustomerId ?? undefined,
      payment_method: account.stripePaymentMethodId,
      confirm: true,
      off_session: true,
      description: 'Parlae AI Receptionist - Activation Fee',
      metadata: {
        accountId: account.id,
        userId: session.user.id,
        type: 'activation_fee',
      },
    });

    if (
      paymentIntent.status === 'succeeded' ||
      paymentIntent.status === 'processing'
    ) {
      return NextResponse.json({
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      });
    }

    return NextResponse.json(
      {
        error: `Payment status: ${paymentIntent.status}`,
        requiresAction: paymentIntent.status === 'requires_action',
      },
      { status: 402 },
    );
  } catch (error: any) {
    console.error('Activation charge error:', error);

    // Handle specific Stripe errors
    if (error?.type === 'StripeCardError') {
      return NextResponse.json(
        { error: error.message || 'Card was declined' },
        { status: 402 },
      );
    }

    return NextResponse.json(
      { error: 'Failed to process activation fee' },
      { status: 500 },
    );
  }
}
