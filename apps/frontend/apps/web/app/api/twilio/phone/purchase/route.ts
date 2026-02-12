import { NextResponse } from 'next/server';
import { createTwilioService } from '@kit/shared/twilio/server';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/twilio/phone/purchase
 * 
 * Purchase a phone number
 * 
 * Body:
 * {
 *   phoneNumber: string (required) - E.164 format (e.g., '+14155551234')
 *   friendlyName?: string
 *   subAccountSid?: string - Twilio sub-account SID (from GHL)
 *   voiceUrl?: string - Webhook URL for incoming calls
 *   smsUrl?: string - Webhook URL for incoming SMS
 * }
 */
export async function POST(request: Request) {
  const logger = await getLogger();

  try {
    const body = await request.json();
    const { phoneNumber, friendlyName, subAccountSid, voiceUrl, smsUrl, accountId } = body;

    // Validate required fields
    if (!phoneNumber) {
      return NextResponse.json(
        {
          success: false,
          message: 'Phone number is required',
        },
        { status: 400 }
      );
    }

    if (!accountId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Account ID is required',
        },
        { status: 400 }
      );
    }

    // VERIFY PAYMENT METHOD BEFORE PURCHASING
    const { prisma } = await import('@kit/prisma');
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        paymentMethodVerified: true,
        stripePaymentMethodId: true,
      },
    });

    if (!account) {
      logger.error({ accountId }, '[Twilio API] Account not found');
      return NextResponse.json(
        {
          success: false,
          message: 'Account not found',
        },
        { status: 404 }
      );
    }

    if (!account.paymentMethodVerified || !account.stripePaymentMethodId) {
      logger.error(
        { accountId, hasPaymentMethod: !!account.stripePaymentMethodId },
        '[Twilio API] Payment method not verified'
      );
      return NextResponse.json(
        {
          success: false,
          message: 'Payment method required. Please add a payment method before purchasing a phone number.',
        },
        { status: 402 }
      );
    }

    logger.info({
      accountId,
      paymentMethodVerified: true,
    }, '[Twilio API] Payment method verified, proceeding with phone purchase');

    const twilioService = createTwilioService();

    if (!twilioService.isEnabled()) {
      logger.warn('[Twilio API] Service not enabled - missing configuration');
      
      return NextResponse.json(
        { 
          success: false,
          message: 'Twilio integration not configured',
        },
        { status: 200 }
      );
    }

    logger.info({
      phoneNumber,
      subAccountSid: subAccountSid || 'main',
    }, '[Twilio API] Attempting to purchase phone number');

    const purchasedNumber = await twilioService.purchaseNumber(
      {
        phoneNumber,
        friendlyName,
        voiceUrl,
        voiceMethod: voiceUrl ? 'POST' : undefined,
        smsUrl,
        smsMethod: smsUrl ? 'POST' : undefined,
      },
      subAccountSid
    );

    if (!purchasedNumber) {
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to purchase phone number',
        },
        { status: 500 }
      );
    }

    logger.info({
      phoneNumber: purchasedNumber.phoneNumber,
      sid: purchasedNumber.sid,
      subAccountSid: subAccountSid || 'main',
    }, '[Twilio API] Successfully purchased phone number');

    return NextResponse.json({
      success: true,
      number: purchasedNumber,
      message: 'Phone number purchased successfully',
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[Twilio API] Exception while purchasing number');

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to purchase phone number',
      },
      { status: 500 }
    );
  }
}
