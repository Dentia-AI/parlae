import { NextRequest, NextResponse } from 'next/server';
import { getLogger } from '@kit/shared/logger';
import { createVapiService } from '@kit/shared/vapi/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * API endpoint to get file details from Vapi
 * GET /api/vapi/get-file/[fileId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const logger = await getLogger();

  try {
    const { fileId } = params;

    if (!fileId) {
      return NextResponse.json(
        { error: 'No file ID provided' },
        { status: 400 }
      );
    }

    logger.info({
      fileId,
    }, '[Vapi Get File] Received file get request');

    // Get file from Vapi
    const vapiService = createVapiService();
    const file = await vapiService.getFile(fileId);

    if (!file) {
      logger.error({
        fileId,
      }, '[Vapi Get File] Failed to get file from Vapi');

      return NextResponse.json(
        { error: 'Failed to get file from Vapi' },
        { status: 500 }
      );
    }

    logger.info({
      fileId,
      fileName: file.name,
    }, '[Vapi Get File] Successfully retrieved file');

    return NextResponse.json({
      success: true,
      fileId: file.id,
      fileName: file.name,
      url: file.url || null,
      mimeType: file.mimeType || null,
      size: file.bytes || file.size || null,
      createdAt: file.createdAt,
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
    }, '[Vapi Get File] Exception during file retrieval');

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
