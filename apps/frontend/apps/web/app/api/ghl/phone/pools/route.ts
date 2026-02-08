import { NextResponse } from 'next/server';
import { createGoHighLevelService } from '@kit/shared/gohighlevel/server';
import { getLogger } from '@kit/shared/logger';

/**
 * GET /api/ghl/phone/pools
 * 
 * Retrieve number pools for the GoHighLevel location
 * Number pools are shared phone numbers that can be used across multiple campaigns
 */
export async function GET(request: Request) {
  const logger = await getLogger();

  try {
    const ghlService = createGoHighLevelService();

    if (!ghlService.isEnabled()) {
      logger.warn('[GHL API] Service not enabled - missing configuration');
      
      return NextResponse.json(
        { 
          success: false,
          message: 'GoHighLevel integration not configured',
          numberPools: [],
        },
        { status: 200 }
      );
    }

    const numberPools = await ghlService.getNumberPools();

    logger.info({
      poolCount: numberPools.length,
    }, '[GHL API] Successfully fetched number pools');

    return NextResponse.json({
      success: true,
      numberPools,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[GHL API] Exception while fetching number pools');

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch number pools',
        numberPools: [],
      },
      { status: 500 }
    );
  }
}
