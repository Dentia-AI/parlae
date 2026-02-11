import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500 }
      );
    }

    // Dynamically import Stripe to avoid issues
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(secretKey, {
      apiVersion: '2024-12-18.acacia',
    });

    // Create a SetupIntent
    const setupIntent = await stripe.setupIntents.create({
      payment_method_types: ['card'],
      usage: 'off_session',
      // In production, add:
      // customer: customerId,
      // metadata: { userId: user.id }
    });

    console.log('SetupIntent created:', setupIntent.id);

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      success: true,
    });
  } catch (error) {
    console.error('Error creating SetupIntent:', error);
    return NextResponse.json(
      { error: 'Failed to create setup intent' },
      { status: 500 }
    );
  }
}
