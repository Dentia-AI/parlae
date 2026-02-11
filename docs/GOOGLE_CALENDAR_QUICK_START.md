# Google Calendar Integration - Quick Start

## What Was Added

✅ **Google Calendar OAuth integration** as an alternative to PMS for appointment management
✅ **Setup wizard integration** - Users can connect during onboarding
✅ **Persistent storage** - Connection status saved to database
✅ **Auto token refresh** - Handles expired tokens automatically

## Setup Steps

### 1. Get Google OAuth Credentials (5 minutes)

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Create project or select existing
3. Enable **Google Calendar API**
4. Create **OAuth 2.0 Client ID**:
   - Type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/google-calendar/callback`
5. Copy Client ID and Secret

### 2. Configure Environment

Add to `apps/backend/.env`:
```bash
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnop
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
```

### 3. Run Migration

```bash
# From project root
cd packages/prisma
npx prisma migrate deploy
npx prisma generate
```

### 4. Restart Servers

```bash
# Kill and restart
./dev.sh
```

## User Flow

### In Setup Wizard (Step 3: Integrations)

1. User sees two options:
   - **PMS Integration** (Full patient management)
   - **Google Calendar** (Appointment management)

2. User clicks "Connect Calendar"
3. Redirected to Google OAuth
4. Grants permissions
5. Redirected back to wizard
6. Shows "Connected as user@gmail.com" ✅

### On Page Refresh

- ✅ Connection status persists
- ✅ Shows connected email
- ✅ Can disconnect/reconnect

## When to Use

### Choose Google Calendar If:
- Small clinic without PMS
- Testing the system
- Simple needs (just appointments)
- Already use Google Workspace

### Choose PMS If:
- Need full patient records
- Insurance billing required
- Payment processing needed
- Have existing PMS system

### Use Both If:
- Want redundancy
- Different use cases
- Migration period

## Backend Usage

### Check Connection Status

```typescript
const account = await prisma.account.findUnique({
  where: { id: accountId },
  select: { 
    googleCalendarConnected: true,
    googleCalendarEmail: true 
  }
});
```

### Create Calendar Event

```typescript
import { GoogleCalendarService } from './google-calendar/google-calendar.service';

// In your service
await this.googleCalendarService.createEvent(accountId, {
  summary: 'Dental Checkup - John Doe',
  description: 'Regular cleaning appointment',
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

## Files Created

### Backend
- `apps/backend/src/google-calendar/google-calendar.module.ts`
- `apps/backend/src/google-calendar/google-calendar.service.ts`
- `apps/backend/src/google-calendar/google-calendar.controller.ts`
- `apps/backend/src/app.module.ts` (updated)
- `apps/backend/package.json` (updated with googleapis)

### Frontend
- `apps/frontend/apps/web/app/api/google-calendar/callback/route.ts`
- `apps/frontend/apps/web/app/home/(user)/agent/setup/integrations/page.tsx` (updated)

### Database
- `packages/prisma/schema.prisma` (updated)
- `packages/prisma/migrations/20260211000002_add_google_calendar/migration.sql`

### Docs
- `docs/GOOGLE_CALENDAR_INTEGRATION.md` (full documentation)
- `docs/GOOGLE_CALENDAR_QUICK_START.md` (this file)

## Testing

### Test Connection Flow

1. Start servers: `./dev.sh`
2. Go to setup wizard: `http://localhost:3000/home/agent/setup`
3. Navigate to "Integrations" step
4. Click "Connect Calendar"
5. Should redirect to Google OAuth
6. Grant permissions
7. Should redirect back showing "Connected"

### Test Event Creation

Create a test script:

```typescript
// scripts/test-google-calendar.ts
import { GoogleCalendarService } from '../apps/backend/src/google-calendar/google-calendar.service';
import { PrismaService } from '../apps/backend/src/prisma/prisma.service';

const prisma = new PrismaService();
const gcal = new GoogleCalendarService(prisma);

const accountId = 'your-test-account-id';

await gcal.createEvent(accountId, {
  summary: 'Test Appointment',
  start: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
  end: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000), // +30min
});

console.log('Event created successfully!');
```

Run: `npx ts-node scripts/test-google-calendar.ts`

## Next Steps

1. ✅ **Completed**: OAuth flow, token storage, UI integration
2. **TODO**: Integrate with Vapi appointment booking webhook
3. **TODO**: Add timezone configuration per account
4. **TODO**: Support multiple calendars
5. **TODO**: Two-way sync (read existing appointments)

## Production Deployment

### Update Redirect URI

In Google Cloud Console:
1. Add production redirect URI: `https://yourdomain.com/api/google-calendar/callback`
2. Update backend .env:
   ```bash
   GOOGLE_REDIRECT_URI=https://yourdomain.com/api/google-calendar/callback
   ```

### Environment Variables

Ensure these are set in production:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

## Troubleshooting

### "Authorization URL failed"
→ Check backend .env has Google credentials

### "Invalid redirect URI"
→ Verify redirect URI in Google Console matches exactly

### "Token expired"
→ Service auto-refreshes, check refresh token exists

### Events not creating
→ Verify Calendar API is enabled in Google Console

## Support

For issues:
1. Check backend logs for `[GoogleCalendarService]` messages
2. Verify OAuth credentials in Google Cloud Console
3. Test with a fresh Google account
4. Check database for stored tokens

Happy calendar connecting! 📅
