import { NextRequest, NextResponse } from 'next/server';
import { getLogger } from '@kit/shared/logger';
import { createVapiService } from '@kit/shared/vapi/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * API endpoint to delete a file from Vapi
 * DELETE /api/vapi/delete-file/[fileId]
 */
export async function DELETE(
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
    }, '[Vapi Delete] Received file delete request');

    // Delete from Vapi
    const vapiService = createVapiService();
    const success = await vapiService.deleteFile(fileId);

    if (!success) {
      logger.error({
        fileId,
      }, '[Vapi Delete] Failed to delete file from Vapi');

      return NextResponse.json(
        { error: 'Failed to delete file from Vapi' },
        { status: 500 }
      );
    }

    logger.info({
      fileId,
    }, '[Vapi Delete] Successfully deleted file');

    return NextResponse.json({
      success: true,
      fileId,
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
    }, '[Vapi Delete] Exception during file deletion');

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
