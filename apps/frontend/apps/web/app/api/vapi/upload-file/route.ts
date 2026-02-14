import { NextRequest, NextResponse } from 'next/server';
import { getLogger } from '@kit/shared/logger';
import { createVapiService } from '@kit/shared/vapi/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * API endpoint to upload files to Vapi knowledge base
 * POST /api/vapi/upload-file
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    logger.info({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    }, '[Vapi Upload] Received file upload request');

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Vapi
    const vapiService = createVapiService();
    const fileId = await vapiService.uploadBinaryFile(
      buffer,
      file.name,
      file.type
    );

    if (!fileId) {
      logger.error({
        fileName: file.name,
      }, '[Vapi Upload] Failed to upload file to Vapi');

      return NextResponse.json(
        { error: 'Failed to upload file to Vapi' },
        { status: 500 }
      );
    }

    logger.info({
      fileName: file.name,
      fileId,
    }, '[Vapi Upload] Successfully uploaded file');

    return NextResponse.json({
      success: true,
      fileId,
      fileName: file.name,
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
    }, '[Vapi Upload] Exception during file upload');

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
