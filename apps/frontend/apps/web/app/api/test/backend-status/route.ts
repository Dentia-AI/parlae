import { NextResponse } from 'next/server';

import { fetchBackendStatus } from '~/lib/server/backend-api';

export async function GET() {
  try {
    const status = await fetchBackendStatus();
    
    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

