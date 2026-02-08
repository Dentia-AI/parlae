import { NextResponse } from 'next/server';
import { createGoHighLevelService } from '@kit/shared/gohighlevel/server';
import { getLogger } from '@kit/shared/logger';

/**
 * GET /api/ghl/phone/available
 * 
 * Retrieve active phone numbers from the GoHighLevel location(s)
 * 
 * Query Parameters:
 * - locationIds: Comma-separated list of location IDs (optional, for agency-level queries)
 * 
 * Note: This returns already purchased phone numbers.
 * - Without locationIds: Returns numbers for the configured GHL_LOCATION_ID
 * - With locationIds: Returns numbers for multiple locations (agency-level view)
 * 
 * GHL does not have a public API endpoint to search for available numbers to purchase.
 */
export async function GET(request: Request) {
  const logger = await getLogger();

  try {
    const { searchParams } = new URL(request.url);
    const locationIdsParam = searchParams.get('locationIds');

    const ghlService = createGoHighLevelService();

    if (!ghlService.isEnabled()) {
      logger.warn('[GHL API] Service not enabled - missing configuration');
      
      return NextResponse.json(
        { 
          success: false,
          message: 'GoHighLevel integration not configured',
          phoneNumbers: [],
        },
        { status: 200 }
      );
    }

    // If locationIds provided, fetch for multiple locations (agency-level)
    if (locationIdsParam) {
      const locationIds = locationIdsParam.split(',').map(id => id.trim()).filter(Boolean);
      
      if (locationIds.length === 0) {
        return NextResponse.json(
          {
            success: false,
            message: 'Invalid locationIds parameter',
            phoneNumbers: [],
          },
          { status: 400 }
        );
      }

      logger.info({
        locationCount: locationIds.length,
      }, '[GHL API] Fetching phone numbers for multiple locations');

      const numbersByLocation = await ghlService.getPhoneNumbersForLocations(locationIds);
      
      // Flatten all numbers into a single array
      const allNumbers = Object.values(numbersByLocation).flat();

      logger.info({
        locationCount: locationIds.length,
        totalNumbers: allNumbers.length,
      }, '[GHL API] Successfully fetched phone numbers for locations');

      return NextResponse.json({
        success: true,
        phoneNumbers: allNumbers,
        byLocation: numbersByLocation, // Also provide breakdown by location
      });
    }

    // Default: fetch for configured location only
    const phoneNumbers = await ghlService.getActivePhoneNumbers();

    logger.info({
      phoneCount: phoneNumbers.length,
    }, '[GHL API] Successfully fetched phone numbers');

    return NextResponse.json({
      success: true,
      phoneNumbers,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[GHL API] Exception while fetching phone numbers');

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch phone numbers',
        phoneNumbers: [],
      },
      { status: 500 }
    );
  }
}
