import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@kit/prisma';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 
    `${process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.NEXTAUTH_URL || 'https://app.parlae.ca'}/api/google-calendar/callback`
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // accountId
  const error = searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    const publicUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.NEXTAUTH_URL || 'https://app.parlae.ca';
    return NextResponse.redirect(
      new URL(
        `/home/agent/setup/integrations?status=error&error=${encodeURIComponent(error)}`,
        publicUrl
      )
    );
  }

  if (!code || !state) {
    const publicUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.NEXTAUTH_URL || 'https://app.parlae.ca';
    return NextResponse.redirect(
      new URL(
        '/home/agent/setup/integrations?status=error&error=Missing authorization code',
        publicUrl
      )
    );
  }

  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user's email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Get primary calendar ID
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendars = await calendar.calendarList.list();
    const primaryCalendar = calendars.data.items?.find(cal => cal.primary);

    // Save tokens to database
    await prisma.account.update({
      where: { id: state },
      data: {
        googleCalendarConnected: true,
        googleCalendarAccessToken: tokens.access_token,
        googleCalendarRefreshToken: tokens.refresh_token,
        googleCalendarTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        googleCalendarId: primaryCalendar?.id || 'primary',
        googleCalendarEmail: userInfo.data.email || null,
      },
    });

    // Redirect back to integrations page with success
    const publicUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.NEXTAUTH_URL || 'https://app.parlae.ca';
    return NextResponse.redirect(
      new URL(
        `/home/agent/setup/integrations?status=success&provider=google-calendar&email=${encodeURIComponent(userInfo.data.email || '')}`,
        publicUrl
      )
    );
  } catch (error) {
    console.error('Google Calendar callback error:', error);
    const publicUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.NEXTAUTH_URL || 'https://app.parlae.ca';
    return NextResponse.redirect(
      new URL(
        `/home/agent/setup/integrations?status=error&error=${encodeURIComponent('Failed to connect Google Calendar')}`,
        publicUrl
      )
    );
  }
}
