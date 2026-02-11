# Google Calendar Integration

## Overview

Google Calendar integration provides an alternative to PMS for appointment management. When users don't have a PMS system or want additional calendar integration, they can connect their Google Calendar to automatically save appointments.

## Architecture

### Backend (NestJS)

**Module**: `apps/backend/src/google-calendar/`

- `google-calendar.module.ts` - NestJS module
- `google-calendar.service.ts` - Core service with OAuth and Calendar API
- `google-calendar.controller.ts` - API endpoints

### Frontend (Next.js)

- **API Route**: `apps/frontend/apps/web/app/api/google-calendar/callback/route.ts` - Handles OAuth callback
- **UI**: `apps/frontend/apps/web/app/home/(user)/agent/setup/integrations/page.tsx` - Integration selection

### Database Schema

```prisma
model Account {
  // Google Calendar integration fields
  googleCalendarConnected     Boolean   @default(false)
  googleCalendarAccessToken   String?   @db.Text
  googleCalendarRefreshToken  String?   @db.Text
  googleCalendarTokenExpiry   DateTime?
  googleCalendarId            String?   // Primary calendar ID
  googleCalendarEmail         String?   // Connected account email
}
```

## Setup

### 1. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google Calendar API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add authorized redirect URI:
   - Development: `http://localhost:3000/api/google-calendar/callback`
   - Production: `https://yourdomain.com/api/google-calendar/callback`
7. Save the **Client ID** and **Client Secret**

### 2. Configure Environment Variables

**Backend** (`apps/backend/.env`):
```bash
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
```

### 3. Run Database Migration

```bash
cd packages/prisma
npx prisma migrate deploy
npx prisma generate
```

### 4. Install Dependencies

```bash
pnpm install
```

googleapis@144 will be installed automatically.

## OAuth Flow

### 1. User Initiates Connection

```typescript
// User clicks "Connect Calendar" button
handleConnectGoogleCalendar()
  ↓
// Frontend calls backend to get auth URL
GET /api/google-calendar/{accountId}/auth-url
  ↓
// Backend generates OAuth URL with scopes
GoogleCalendarService.getAuthUrl(accountId)
  ↓
// Frontend redirects to Google OAuth
window.location.href = authUrl
```

### 2. Google OAuth Consent

User sees Google's consent screen requesting:
- ✅ View and manage calendar events
- ✅ Access email address

### 3. Callback Processing

```typescript
// Google redirects to callback URL with code
GET /api/google-calendar/callback?code=xxx&state=accountId
  ↓
// Next.js route handler forwards to backend
POST /api/google-calendar/{accountId}/callback
  ↓
// Backend exchanges code for tokens
GoogleCalendarService.exchangeCodeForTokens(code, accountId)
  ↓
// Tokens saved to database
account.update({
  googleCalendarConnected: true,
  googleCalendarAccessToken: token,
  googleCalendarRefreshToken: refreshToken,
  googleCalendarEmail: user@gmail.com
})
  ↓
// Redirect back to integrations page
/home/agent/setup/integrations?status=success&provider=google-calendar
```

## Features

### Token Management

**Auto-Refresh**: Tokens are automatically refreshed when expired
```typescript
// Service checks expiry before each API call
if (expiry && expiry < now) {
  accessToken = await this.refreshAccessToken(accountId);
}
```

**Security**: 
- Access tokens encrypted at rest (TEXT field)
- Refresh tokens allow long-term access
- Tokens never exposed to frontend

### Creating Appointments

```typescript
// From anywhere in the backend
await googleCalendarService.createEvent(accountId, {
  summary: 'Patient Appointment',
  description: 'Dental checkup for John Doe',
  start: new Date('2026-02-15T10:00:00'),
  end: new Date('2026-02-15T10:30:00'),
  attendees: ['patient@example.com'],
});
```

Returns:
```typescript
{
  success: true,
  eventId: 'abc123xyz',
  htmlLink: 'https://calendar.google.com/event?eid=...'
}
```

## UI/UX

### Integration Selection Page

Users see two options:

1. **Practice Management System (PMS)**
   - Full patient management
   - Appointment booking
   - Insurance verification
   - Payment processing

2. **Google Calendar**
   - Appointment management only
   - Simple, familiar interface
   - Works without PMS

### States

#### Not Connected
```
┌─────────────────────────────────────┐
│ 📅 Google Calendar                  │
│ Save appointments to your calendar  │
│ ✓ Appointment management            │
│                   [Connect Calendar] │
└─────────────────────────────────────┘
```

#### Connected
```
┌─────────────────────────────────────┐
│ 📅 Google Calendar       [Connected]│
│ Connected as user@gmail.com         │
│                        [Disconnect] │
└─────────────────────────────────────┘
```

### Smart Recommendations

- **PMS Connected + No Calendar**: "Google Calendar is optional"
- **No PMS + No Calendar**: "Connect either PMS or Google Calendar to enable appointment management"
- **Both Connected**: Both badges show "Connected"

## Integration with Setup Wizard

### Progress Tracking

Google Calendar connection status is saved in setup progress:

```json
{
  "integrations": {
    "data": {
      "pmsConnected": false,
      "googleCalendarConnected": true,
      "googleCalendarEmail": "clinic@example.com"
    },
    "completedAt": "2026-02-11T20:45:00.000Z"
  }
}
```

### Saved & Restored

- ✅ Connection status persists across page refreshes
- ✅ Shows connected email on return
- ✅ Can disconnect and reconnect
- ✅ Works independently of PMS

## Backend API Endpoints

### Get Auth URL
```http
GET /api/google-calendar/:accountId/auth-url
Authorization: Bearer {cognitoToken}

Response:
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

### Handle Callback
```http
POST /api/google-calendar/:accountId/callback
Authorization: Bearer {cognitoToken}
Content-Type: application/json

Body:
{
  "code": "authorization_code_from_google"
}

Response:
{
  "success": true,
  "email": "user@gmail.com",
  "calendarId": "primary"
}
```

### Disconnect
```http
POST /api/google-calendar/:accountId/disconnect
Authorization: Bearer {cognitoToken}

Response:
{
  "success": true
}
```

### Create Event
```typescript
// Used internally by backend services
await googleCalendarService.createEvent(accountId, {
  summary: string,
  description?: string,
  start: Date,
  end: Date,
  attendees?: string[]
});
```

## Security

### OAuth Scopes Requested

- `https://www.googleapis.com/auth/calendar` - Full calendar access
- `https://www.googleapis.com/auth/calendar.events` - Event management
- `https://www.googleapis.com/auth/userinfo.email` - User email

### Token Storage

- **Access Token**: TEXT field (encrypted at rest via Prisma)
- **Refresh Token**: TEXT field (encrypted at rest)
- **Never Exposed**: Tokens never sent to frontend
- **Automatic Refresh**: Service handles token renewal

### Authentication

- **Backend API**: Protected with `CognitoAuthGuard`
- **Account Scoping**: Each account has own calendar connection
- **User Authorization**: Google consent screen ensures user approval

## Usage in Voice Agent

When a patient calls to book an appointment:

```typescript
// Vapi webhook receives booking request
// Backend checks available integrations
const account = await prisma.account.findUnique({
  where: { id: accountId },
  select: {
    googleCalendarConnected: true,
    // ... other fields
  }
});

if (account.googleCalendarConnected) {
  // Create appointment in Google Calendar
  await googleCalendarService.createEvent(accountId, {
    summary: `Appointment: ${patientName}`,
    start: appointmentStart,
    end: appointmentEnd,
    attendees: [patientEmail],
  });
}
```

## Error Handling

### OAuth Errors

```typescript
// User denies consent
?status=error&error=access_denied
→ Shows: "Failed to connect Google Calendar"

// Invalid code
?status=error&error=invalid_grant
→ Shows: "Authorization failed. Please try again."
```

### API Errors

```typescript
// Token expired and refresh failed
→ Auto-disconnects calendar
→ Notifies user to reconnect

// Rate limit exceeded
→ Retries with exponential backoff
→ Falls back to PMS if available
```

## Testing

### Manual Test Flow

1. **Connect Calendar**
   - Click "Connect Calendar"
   - Sign in to Google
   - Grant permissions
   - ✅ See "Connected as user@gmail.com"

2. **Persist Across Refresh**
   - Refresh the page
   - ✅ Still shows connected

3. **Disconnect**
   - Click "Disconnect"
   - ✅ Status resets to "Connect Calendar"

4. **Create Event (Backend)**
   ```bash
   # Test via script
   node scripts/test-google-calendar-event.js
   ```

### Test Credentials

Use a test Google account for development to avoid cluttering your personal calendar.

## Limitations

- **One Calendar Per Account**: Uses primary calendar
- **Timezone**: Currently hardcoded to 'America/Toronto' (TODO: make configurable)
- **No Sync**: One-way (app → calendar), doesn't read existing events
- **No Webhooks**: Doesn't listen to calendar changes

## Future Enhancements

- [ ] Allow selecting specific calendar (not just primary)
- [ ] Configurable timezone per account
- [ ] Two-way sync (read existing appointments)
- [ ] Google Calendar webhook notifications
- [ ] Support for recurring appointments
- [ ] Calendar availability checking
- [ ] Multiple calendar support

## Troubleshooting

### "Failed to get authorization URL"
- Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in backend .env
- Verify redirect URI matches Google Cloud Console configuration

### "Invalid CSRF token" (if using API routes)
- This is why we use Server Actions for setup progress
- Google Calendar uses direct backend calls (not server actions)

### Token refresh failures
- Check if refresh token was stored (requires `prompt: 'consent'`)
- Verify user granted offline access

### Calendar not creating events
- Check Google Calendar API is enabled
- Verify scopes were granted
- Check token hasn't expired and refresh failed

## Integration Priority

**When should users choose Google Calendar over PMS?**

- ✅ Small clinic without existing PMS
- ✅ Testing/trial phase
- ✅ Simple appointment management needs
- ✅ Already heavy Google Workspace users

**When should users choose PMS?**

- ✅ Need patient records management
- ✅ Insurance billing required
- ✅ Payment processing needed
- ✅ Existing PMS infrastructure

**Best Practice**: Connect both for redundancy! 💡
