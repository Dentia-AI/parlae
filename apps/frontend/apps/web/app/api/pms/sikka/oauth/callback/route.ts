import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  console.log('[Sikka OAuth Callback] Received callback', {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  // Handle OAuth errors (user denied authorization)
  if (error) {
    console.error(`[Sikka OAuth] Error: ${error} - ${errorDescription}`);
    return NextResponse.redirect(
      new URL(
        `/home/agent/setup/integrations?status=error&provider=sikka&error=${encodeURIComponent(error)}`,
        request.url
      )
    );
  }

  if (!code || !state) {
    console.error('[Sikka OAuth] Missing code or state');
    return NextResponse.redirect(
      new URL(
        '/home/agent/setup/integrations?status=error&provider=sikka&error=Missing authorization code',
        request.url
      )
    );
  }

  try {
    // Parse and verify state
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { accountId, timestamp } = stateData;

    console.log('[Sikka OAuth] State data:', { accountId, age: Date.now() - timestamp });

    // Verify timestamp (must be < 10 minutes old)
    const now = Date.now();
    const age = now - timestamp;
    if (age > 10 * 60 * 1000) {
      throw new Error('Authorization expired. Please try again.');
    }

    // Exchange authorization code via backend API
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3333';
    console.log('[Sikka OAuth] Calling backend to exchange code:', backendUrl);
    
    const response = await fetch(`${backendUrl}/pms/sikka/exchange-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, accountId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Sikka OAuth] Backend exchange failed:', response.status, errorText);
      throw new Error(`Backend exchange failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('[Sikka OAuth] Exchange result:', { success: result.success });

    if (!result.success) {
      throw new Error(result.error || 'Failed to connect Sikka PMS');
    }

    // Success - redirect back to integrations page
    console.log('[Sikka OAuth] Success! Redirecting to integrations page');
    return NextResponse.redirect(
      new URL(
        `/home/agent/setup/integrations?status=success&provider=sikka`,
        request.url
      )
    );
  } catch (error: any) {
    console.error('[Sikka OAuth] Callback error:', error);
    return NextResponse.redirect(
      new URL(
        `/home/agent/setup/integrations?status=error&provider=sikka&error=${encodeURIComponent(error.message || 'Failed to connect Sikka PMS')}`,
        request.url
      )
    );
  }
}
