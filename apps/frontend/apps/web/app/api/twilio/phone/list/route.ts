import { NextResponse } from 'next/server';
import { createTwilioService } from '@kit/shared/twilio/server';
import { getLogger } from '@kit/shared/logger';

/**
 * GET /api/twilio/phone/list
 * 
 * List purchased phone numbers
 * 
 * Query Parameters:
 * - subAccountSid: Twilio sub-account SID (optional, defaults to main account)
 */
export async function GET(request: Request) {
  const logger = await getLogger();

  try {
    const { searchParams } = new URL(request.url);
    const subAccountSid = searchParams.get('subAccountSid') || undefined;

    const twilioService = createTwilioService();

    if (!twilioService.isEnabled()) {
      logger.warn('[Twilio API] Service not enabled - missing configuration');
      
      return NextResponse.json(
        { 
          success: false,
          message: 'Twilio integration not configured',
          numbers: [],
        },
        { status: 200 }
      );
    }

    const numbers = await twilioService.listNumbers(subAccountSid);

    logger.info({
      count: numbers.length,
      subAccountSid: subAccountSid || 'main',
    }, '[Twilio API] Successfully listed phone numbers');

    return NextResponse.json({
      success: true,
      numbers,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[Twilio API] Exception while listing numbers');

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to list phone numbers',
        numbers: [],
      },
      { status: 500 }
    );
  }
}
