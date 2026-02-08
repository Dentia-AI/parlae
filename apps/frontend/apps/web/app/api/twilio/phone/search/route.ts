import { NextResponse } from 'next/server';
import { createTwilioService } from '@kit/shared/twilio/server';
import { getLogger } from '@kit/shared/logger';

/**
 * GET /api/twilio/phone/search
 * 
 * Search for available phone numbers to purchase
 * 
 * Query Parameters:
 * - countryCode: ISO country code (default: 'US')
 * - type: 'Local', 'TollFree', or 'Mobile' (default: 'Local')
 * - areaCode: Filter by area code
 * - contains: Filter numbers containing this pattern
 * - smsEnabled: Filter by SMS capability (default: true)
 * - voiceEnabled: Filter by voice capability (default: true)
 * - limit: Max results to return (default: 20)
 */
export async function GET(request: Request) {
  const logger = await getLogger();

  try {
    const { searchParams } = new URL(request.url);
    
    const countryCode = searchParams.get('countryCode') || 'US';
    const type = (searchParams.get('type') || 'Local') as 'Local' | 'TollFree' | 'Mobile';
    const areaCode = searchParams.get('areaCode') || undefined;
    const contains = searchParams.get('contains') || undefined;
    const smsEnabled = searchParams.get('smsEnabled') !== 'false';
    const voiceEnabled = searchParams.get('voiceEnabled') !== 'false';
    const limit = parseInt(searchParams.get('limit') || '20', 10);

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

    const numbers = await twilioService.searchAvailableNumbers(
      countryCode,
      type,
      {
        areaCode,
        contains,
        smsEnabled,
        voiceEnabled,
        limit,
        excludeAllAddressRequired: true, // Simplify purchase process
      }
    );

    logger.info({
      countryCode,
      type,
      count: numbers.length,
    }, '[Twilio API] Successfully searched available numbers');

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
    }, '[Twilio API] Exception while searching numbers');

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to search available numbers',
        numbers: [],
      },
      { status: 500 }
    );
  }
}
