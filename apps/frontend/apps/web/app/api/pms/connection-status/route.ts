import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '~/lib/auth/get-session';

/**
 * GET /api/pms/connection-status
 * Check the status of a PMS integration connection
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const session = await requireSession();
    const userId = session.userId;

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get account ID from query params or session storage
    const accountId = request.nextUrl.searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'Missing accountId parameter' },
        { status: 400 }
      );
    }

    // Call backend API to check connection status
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';
    const response = await fetch(
      `${backendUrl}/api/pms/connection-status?accountId=${accountId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { 
          isConnected: false,
          error: errorData.message || 'Failed to check connection status' 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      isConnected: data.isConnected,
      status: data.status,
      practiceName: data.practiceName,
      provider: data.provider,
      lastSync: data.lastSync,
      error: data.error,
    });
  } catch (error) {
    console.error('Error checking PMS connection status:', error);
    return NextResponse.json(
      { 
        isConnected: false,
        error: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
