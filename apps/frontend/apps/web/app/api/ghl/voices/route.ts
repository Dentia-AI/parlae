import { NextResponse } from 'next/server';
import { createGoHighLevelService } from '@kit/shared/gohighlevel/server';
import { getLogger } from '@kit/shared/logger';

/**
 * GET /api/ghl/voices
 * 
 * Retrieve available GoHighLevel AI voice options
 * 
 * Note: GHL Voices API is "coming soon" per their documentation.
 * Currently returns a curated list of common voice options.
 */
export async function GET() {
  const logger = await getLogger();

  try {
    const ghlService = createGoHighLevelService();

    if (!ghlService.isEnabled()) {
      logger.warn('[GHL API] Service not enabled - missing configuration');
      
      return NextResponse.json(
        { 
          success: false,
          message: 'GoHighLevel integration not configured',
          voices: [],
        },
        { status: 200 }
      );
    }

    const voices = await ghlService.getVoices();

    logger.info({
      voiceCount: voices.length,
    }, '[GHL API] Successfully fetched voices');

    return NextResponse.json({
      success: true,
      voices,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[GHL API] Exception while fetching voices');

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch voices',
        voices: [],
      },
      { status: 500 }
    );
  }
}
