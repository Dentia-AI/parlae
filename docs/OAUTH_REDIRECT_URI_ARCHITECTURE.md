# OAuth Redirect URI Architecture

## Current State

You have **two different OAuth integrations** with different patterns:

### Google Calendar ✅ (Frontend-handled)
```
Frontend → Google OAuth → Frontend Callback → Database
```
- **Redirect URI**: `http://localhost:3000/api/google-calendar/callback`
- **Handler**: Next.js API Route
- **Flow**: Same window redirect
- **Auth**: NextAuth (automatic)

### Sikka PMS ⚠️ (Mixed/Broken)
```
Frontend → Sikka OAuth → ??? (unclear) → Database
```
- **Expected URI**: `http://localhost:3000/api/pms/sikka/oauth/callback` ❌ (doesn't exist)
- **Actual backend**: `http://localhost:3333/pms/sikka/oauth/callback` ✅ (exists in NestJS)
- **Current code**: Points to frontend but route doesn't exist!

## The Problem

Your `pms-setup-wizard.tsx` constructs:
```typescript
const redirectUri = `${window.location.origin}/api/pms/sikka/oauth/callback`;
// This resolves to: http://localhost:3000/api/pms/sikka/oauth/callback
// But this Next.js route DOESN'T EXIST!
```

The actual handler is in backend:
```typescript
// apps/backend/src/pms/pms.controller.ts
@Get('pms/sikka/oauth/callback')  // http://localhost:3333/pms/sikka/oauth/callback
```

**Result**: Sikka redirects to a 404 page! 🐛

## Solution Options

### Option 1: Frontend Handles Callback (Recommended) ✅

**Create Next.js route** that handles the Sikka redirect:

```
Sikka OAuth → Next.js Callback Route → Backend API (exchange code) → Database
```

**Pros**:
- ✅ Same pattern as Google Calendar
- ✅ Same-window redirect (better UX)
- ✅ Consistent architecture
- ✅ NextAuth handles authentication

**Redirect URI**:
```
Local: http://localhost:3000/api/pms/sikka/oauth/callback
Prod: https://yourdomain.com/api/pms/sikka/oauth/callback
```

**Files**:
- `apps/frontend/apps/web/app/api/pms/sikka/oauth/callback/route.ts` ✅ (just created)
- Calls backend `/pms/sikka/exchange-code` endpoint to process

### Option 2: Backend Handles Callback (Complex) ⚠️

**Use backend endpoint** and open OAuth in new tab:

```
Open New Tab → Sikka OAuth → Backend Callback → Close Tab + Notify Parent
```

**Pros**:
- ✅ Backend has full control
- ✅ Can validate on server

**Cons**:
- ❌ Must open in **new tab/popup**
- ❌ Need postMessage or polling to communicate status
- ❌ More complex UX
- ❌ Popup blockers might interfere

**Redirect URI**:
```
Local: http://localhost:3333/pms/sikka/oauth/callback
Prod: https://yourdomain.com/api/pms/sikka/oauth/callback  (via proxy)
```

**Implementation**:
```typescript
// Open in new window
const oauthWindow = window.open(oauthUrl, 'sikka-oauth', 'width=600,height=700');

// Poll for completion
const pollInterval = setInterval(async () => {
  const status = await checkConnectionStatus(accountId);
  if (status.connected) {
    clearInterval(pollInterval);
    oauthWindow?.close();
    // Update UI
  }
}, 2000);
```

## Recommended Architecture

**Use Frontend for Both** (Consistency):

```
┌─────────────────────────────────────────────┐
│ OAuth Provider (Google / Sikka)            │
└─────────────┬───────────────────────────────┘
              │ Redirects to...
              ↓
┌─────────────────────────────────────────────┐
│ Next.js API Route (Frontend)               │
│ /api/google-calendar/callback              │
│ /api/pms/sikka/oauth/callback              │
│                                             │
│ • Receives OAuth code                       │
│ • Exchanges for tokens (calls backend if   │
│   complex logic needed)                     │
│ • Saves to database                         │
│ • Redirects to success page                 │
└─────────────────────────────────────────────┘
```

## Configuration Required

### For Sikka (in Sikka Portal)

**Development**:
```
http://localhost:3000/api/pms/sikka/oauth/callback
```

**Production** (Ngrok):
```
https://matterless-eartha-unraffled.ngrok-free.dev/api/pms/sikka/oauth/callback
```

**Production** (Final):
```
https://yourdomain.com/api/pms/sikka/oauth/callback
```

### For Google Calendar (in Google Cloud Console)

**Development**:
```
http://localhost:3000/api/google-calendar/callback
```

**Production** (Ngrok):
```
https://matterless-eartha-unraffled.ngrok-free.dev/api/google-calendar/callback
```

**Production** (Final):
```
https://yourdomain.com/api/google-calendar/callback
```

## Implementation Status

### ✅ Already Implemented
- Google Calendar frontend callback
- Sikka backend callback (NestJS)

### 📝 To Implement (Option 1 - Recommended)
- [x] Create `/api/pms/sikka/oauth/callback` route in Next.js
- [ ] Update backend to add `/pms/sikka/exchange-code` endpoint (if needed)
- [ ] Test Sikka OAuth flow
- [ ] Update Sikka redirect URI in Sikka portal

### 📝 To Implement (Option 2 - If you want backend)
- [ ] Update frontend to open OAuth in new tab
- [ ] Implement polling mechanism
- [ ] Handle popup communication
- [ ] Update redirect URI to backend URL

## Code Locations

### Frontend (Next.js)
```
apps/frontend/apps/web/
└── app/api/
    ├── google-calendar/
    │   ├── [accountId]/auth-url/route.ts
    │   ├── [accountId]/disconnect/route.ts
    │   └── callback/route.ts
    └── pms/
        └── sikka/oauth/callback/route.ts  ← New!
```

### Backend (NestJS)
```
apps/backend/src/
└── pms/
    ├── pms.controller.ts      # Has /sikka/oauth/callback
    └── pms.service.ts         # Has handleSikkaOAuthCallback()
```

### UI Component
```
apps/frontend/apps/web/app/home/(user)/agent/setup/_components/
└── pms-setup-wizard.tsx       # Needs redirect URI update
```

## Next Steps

1. **Decide on architecture**:
   - Option 1 (Frontend): Update redirect URI, test
   - Option 2 (Backend): Implement new tab flow

2. **Update Sikka Portal**:
   - Add new redirect URI to your Sikka app configuration

3. **Test OAuth flow**:
   - Click "Connect PMS"
   - Complete OAuth
   - Verify redirect works
   - Check database has tokens

## My Recommendation

**Use Option 1 (Frontend-handled)** because:
1. ✅ Matches Google Calendar pattern
2. ✅ Simpler implementation
3. ✅ Better user experience (same window)
4. ✅ Easier to maintain (one pattern)
5. ✅ Frontend already has database access

The backend can still be called for complex processing, but the redirect is handled by Next.js.
