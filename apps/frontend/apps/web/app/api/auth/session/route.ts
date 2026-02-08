import { NextResponse } from 'next/server';
import { auth } from '@kit/shared/auth';

/**
 * CORS headers for hub.dentiaapp.com to check auth status
 * This enables the unified auth flow where hub can detect if user is logged in
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://hub.dentiaapp.com',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * GET /api/auth/session
 * Returns the current authentication status for CORS requests from hub.dentiaapp.com
 * This allows hub to implement silent SSO (auto-login if already authenticated)
 */
export async function GET(request: Request) {
  try {
    const session = await auth();

    if (session?.user) {
      return NextResponse.json(
        {
          isAuthenticated: true,
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
          },
        },
        { headers: CORS_HEADERS },
      );
    }

    return NextResponse.json(
      { isAuthenticated: false },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error('[Session API] Error checking session:', error);
    
    return NextResponse.json(
      { isAuthenticated: false },
      { headers: CORS_HEADERS },
    );
  }
}

/**
 * OPTIONS /api/auth/session
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

