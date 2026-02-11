# Google Calendar - Final Architecture ✅

## Architecture Decision

**Google Calendar integration now lives in the Frontend (Next.js)**, not the Backend (NestJS).

### Why Frontend?

1. ✅ **No JWT/Auth Issues** - Next.js API routes have direct session access
2. ✅ **OAuth Callbacks** - Easier to handle redirects in Next.js
3. ✅ **Database Access** - Can use Prisma directly via `@kit/prisma`
4. ✅ **Follows Pattern** - Similar to other integrations and server actions
5. ✅ **Simpler** - No need for frontend → backend API calls

### Architecture Flow

```
┌─────────────────────────────────────────────────┐
│ Frontend (Browser)                              │
│                                                 │
│ User clicks "Connect Calendar"                  │
│         ↓                                       │
└─────────┼───────────────────────────────────────┘
          │
          ↓
┌─────────────────────────────────────────────────┐
│ Next.js API Route                               │
│ /api/google-calendar/[accountId]/auth-url      │
│                                                 │
│ • Checks user session (NextAuth)               │
│ • Generates Google OAuth URL                    │
│ • Returns authUrl to frontend                   │
└─────────┼───────────────────────────────────────┘
          │
          ↓ Redirect user to Google
┌─────────────────────────────────────────────────┐
│ Google OAuth Consent Screen                     │
│                                                 │
│ User grants calendar access                     │
└─────────┼───────────────────────────────────────┘
          │
          ↓ Redirect back with code
┌─────────────────────────────────────────────────┐
│ Next.js API Route                               │
│ /api/google-calendar/callback                  │
│                                                 │
│ • Exchanges code for tokens                     │
│ • Gets user's calendar info                     │
│ • Saves to database (Prisma)                    │
│ • Redirects to /integrations?status=success    │
└─────────┼───────────────────────────────────────┘
          │
          ↓
┌─────────────────────────────────────────────────┐
│ Frontend (Browser)                              │
│                                                 │
│ Shows "Connected ✅" status                     │
└─────────────────────────────────────────────────┘
```

## Files Structure

### Frontend (Next.js) - Main Implementation ✅

```
apps/frontend/apps/web/
├── app/api/google-calendar/
│   ├── [accountId]/
│   │   ├── auth-url/
│   │   │   └── route.ts          # Generate OAuth URL
│   │   └── disconnect/
│   │       └── route.ts          # Disconnect calendar
│   └── callback/
│       └── route.ts              # Handle OAuth callback
└── app/home/(user)/agent/setup/integrations/
    └── page.tsx                  # UI component (calls API routes)
```

### Backend (NestJS) - Optional for Future Use

```
apps/backend/src/google-calendar/
├── google-calendar.module.ts     # Can be used later for backend operations
├── google-calendar.service.ts    # Can create events from webhooks
└── google-calendar.controller.ts # Not needed for setup flow
```

**Note**: The NestJS module exists but is **not used** for the setup flow. It can be used later for:
- Creating calendar events from Vapi webhooks
- Background sync operations
- Server-side calendar management

## Configuration

### Frontend Environment (.env.local)

```bash
# Google Calendar OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback

# For production
# GOOGLE_REDIRECT_URI=https://matterless-eartha-unraffled.ngrok-free.dev/api/google-calendar/callback
```

### Backend Environment (apps/backend/.env)

```bash
# Not needed for OAuth flow anymore
# Can be removed or kept for future backend-side operations
```

## API Routes

### 1. Get OAuth URL

**Endpoint**: `GET /api/google-calendar/[accountId]/auth-url`

**Authentication**: NextAuth session (automatic)

**Response**:
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

### 2. OAuth Callback

**Endpoint**: `GET /api/google-calendar/callback?code=xxx&state=accountId`

**Authentication**: None (public callback)

**Process**:
1. Exchange code for tokens
2. Get user email & calendar info
3. Save to database
4. Redirect to integrations page

**Redirect**: `/home/agent/setup/integrations?status=success&provider=google-calendar&email=user@gmail.com`

### 3. Disconnect

**Endpoint**: `POST /api/google-calendar/[accountId]/disconnect`

**Authentication**: NextAuth session (automatic)

**Response**:
```json
{
  "success": true
}
```

## Database Schema

```prisma
model Account {
  // Google Calendar fields
  googleCalendarConnected     Boolean   @default(false)
  googleCalendarAccessToken   String?   @db.Text
  googleCalendarRefreshToken  String?   @db.Text
  googleCalendarTokenExpiry   DateTime?
  googleCalendarId            String?
  googleCalendarEmail         String?
}
```

## Security

### Frontend (Next.js API Routes)

- ✅ **NextAuth Session** - Automatic authentication
- ✅ **No CSRF Issues** - Next.js handles this
- ✅ **Server-Side** - Tokens never exposed to browser
- ✅ **Database Direct** - Prisma access from API routes

### Token Storage

- ✅ **Encrypted at Rest** - PostgreSQL TEXT fields
- ✅ **Server-Side Only** - Never sent to client
- ✅ **Refresh Token** - Long-term access

## Usage in Frontend

```typescript
// Component calls Next.js API route (not backend)
const response = await fetch(`/api/google-calendar/${accountId}/auth-url`);
const { authUrl } = await response.json();
window.location.href = authUrl;
```

## Future: Backend Event Creation

When a patient books via Vapi, the **backend** can create calendar events:

```typescript
// In Vapi webhook handler (NestJS)
import { GoogleCalendarService } from './google-calendar/google-calendar.service';

async handleAppointmentBooked(data) {
  const account = await this.prisma.account.findUnique({
    where: { id: accountId },
    select: {
      googleCalendarConnected: true,
      googleCalendarAccessToken: true,
      // ... other fields
    }
  });

  if (account.googleCalendarConnected) {
    // Use the backend service for server-side operations
    await this.googleCalendarService.createEvent(accountId, {
      summary: `Appointment: ${patientName}`,
      start: bookingTime,
      end: bookingEndTime,
    });
  }
}
```

## Benefits of Frontend Approach

1. **No Authentication Complexity**
   - No JWT tokens to manage
   - No CORS issues
   - NextAuth handles everything

2. **Direct Database Access**
   - No API layer needed
   - Faster and simpler
   - Uses existing Prisma setup

3. **Better OAuth Flow**
   - Callbacks go directly to Next.js
   - Easier to handle redirects
   - Cleaner user experience

4. **Follows Patterns**
   - Similar to Server Actions
   - Matches setup wizard architecture
   - Consistent with PMS integration

## Testing

### Test OAuth Flow

1. Click "Connect Calendar"
2. Should redirect to Google
3. Grant permissions
4. Should redirect back to integrations
5. Should show "Connected ✅"

### Verify Database

```sql
SELECT 
  id,
  google_calendar_connected,
  google_calendar_email
FROM accounts;
```

## Status

✅ **Architecture Finalized** - Frontend (Next.js) approach
✅ **API Routes Created** - All 3 endpoints
✅ **Frontend Updated** - Calls local API routes
✅ **googleapis Added** - To frontend package
✅ **Configuration Ready** - Just needs OAuth credentials

## Next Steps

1. **Add Google OAuth credentials** to `.env.local`
2. **Test the flow** (should work now!)
3. **Keep backend service** for future webhook event creation

---

**Architecture Decision**: Frontend ✅  
**Reason**: Simpler, more secure, follows patterns  
**Backend Role**: Future event creation from webhooks
