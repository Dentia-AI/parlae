import { NextResponse } from 'next/server';
import { createGoHighLevelService } from '@kit/shared/gohighlevel/server';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/gohighlevel/add-tags
 * 
 * Add tags to a GoHighLevel contact (upsert-safe - merges tags)
 * 
 * Security: This endpoint should be called from internal services only
 * In production, add authentication via API key or internal service auth
 */
export async function POST(request: Request) {
  const logger = await getLogger();

  try {
    // Get API key from request header for security
    const authHeader = request.headers.get('authorization');
    const internalApiKey = process.env.INTERNAL_API_KEY;

    // If INTERNAL_API_KEY is configured, require it
    if (internalApiKey) {
      if (!authHeader || authHeader !== `Bearer ${internalApiKey}`) {
        logger.warn({
          hasAuthHeader: !!authHeader,
        }, '[GHL API] Unauthorized add-tags request');

        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    // Parse request body
    const body = await request.json();
    const { email, tags, source } = body;

    // Validate input
    if (!email || !tags || !Array.isArray(tags) || tags.length === 0) {
      logger.warn({
        hasEmail: !!email,
        hasTags: !!tags,
        isArray: Array.isArray(tags),
        tagCount: Array.isArray(tags) ? tags.length : 0,
      }, '[GHL API] Invalid add-tags request');

      return NextResponse.json(
        { 
          error: 'Invalid request',
          message: 'Email and tags array are required',
        },
        { status: 400 }
      );
    }

    // Call GHL service to add tags
    const ghlService = createGoHighLevelService();

    if (!ghlService.isEnabled()) {
      logger.warn('[GHL API] Service not enabled - missing configuration');
      
      return NextResponse.json(
        { 
          success: false,
          message: 'GoHighLevel integration not configured',
        },
        { status: 200 } // Return 200 to not break calling service
      );
    }

    const contactId = await ghlService.addContactTags({
      email,
      tags,
      source: source || 'DentiaHub Activity',
    });

    if (contactId) {
      logger.info({
        email,
        tags,
        contactId,
      }, '[GHL API] Successfully added tags to contact');

      return NextResponse.json({
        success: true,
        contactId,
        email,
        tags,
      });
    } else {
      logger.error({
        email,
        tags,
      }, '[GHL API] Failed to add tags to contact');

      return NextResponse.json(
        {
          success: false,
          message: 'Failed to add tags to GoHighLevel contact',
        },
        { status: 200 } // Return 200 to not break calling service
      );
    }
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[GHL API] Exception while adding tags');

    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

