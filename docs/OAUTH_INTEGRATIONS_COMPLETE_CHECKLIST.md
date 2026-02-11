# OAuth Integrations - Complete Checklist

## ✅ Implementation Complete

Both Google Calendar and Sikka PMS now use **Frontend (Next.js) OAuth pattern**!

## Summary

| Integration | Redirect URI | Status |
|-------------|--------------|--------|
| **Google Calendar** | `http://localhost:3000/api/google-calendar/callback` | ✅ Complete |
| **Sikka PMS** | `http://localhost:3000/api/pms/sikka/oauth/callback` | ✅ Complete |

## Configuration Checklist

### 1. Google Calendar Setup

- [ ] Go to [Google Cloud Console](https://console.cloud.google.com/)
- [ ] Enable **Google Calendar API**
- [ ] Create **OAuth 2.0 Client ID** (Web application)
- [ ] Add redirect URIs:
  - Development: `http://localhost:3000/api/google-calendar/callback`
  - Ngrok: `https://matterless-eartha-unraffled.ngrok-free.dev/api/google-calendar/callback`
- [ ] Copy **Client ID** and **Client Secret**
- [ ] Add to `.env.local`:
  ```bash
  GOOGLE_CLIENT_ID=your_client_id
  GOOGLE_CLIENT_SECRET=your_client_secret
  GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
  ```

### 2. Sikka PMS Setup

- [ ] Go to [Sikka Portal](https://api.sikkasoft.com/)
- [ ] Configure your app
- [ ] Add redirect URIs:
  - Development: `http://localhost:3000/api/pms/sikka/oauth/callback`
  - Ngrok: `https://matterless-eartha-unraffled.ngrok-free.dev/api/pms/sikka/oauth/callback`
- [ ] Verify `NEXT_PUBLIC_SIKKA_APP_ID` is in `.env.local`
- [ ] Verify `SIKKA_APP_ID` and `SIKKA_APP_KEY` are in `apps/backend/.env`

### 3. Environment Variables

**.env.local** (Frontend):
```bash
# Backend URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:3333

# Google Calendar
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback

# Sikka PMS
NEXT_PUBLIC_SIKKA_APP_ID=your_sikka_app_id
```

**apps/backend/.env** (Backend):
```bash
# Port
PORT=3333

# Sikka System Credentials
SIKKA_APP_ID=your_sikka_app_id
SIKKA_APP_KEY=your_sikka_app_key
```

### 4. Test Google Calendar

- [ ] Navigate to `/home/agent/setup/integrations`
- [ ] Click "Connect Calendar"
- [ ] Should redirect to Google OAuth
- [ ] Grant permissions
- [ ] Should redirect back and show "Connected ✅"
- [ ] Refresh page - connection should persist
- [ ] Click "Disconnect" - should work

### 5. Test Sikka PMS

- [ ] Navigate to `/home/agent/setup/integrations`
- [ ] Click "Connect PMS"
- [ ] Should redirect to Sikka OAuth
- [ ] Grant permissions
- [ ] Should redirect back and show "Connected ✅"
- [ ] Check database for `pmsIntegration` record
- [ ] Verify credentials in AWS Secrets Manager

## Architecture Overview

### Both Use Same Pattern ✅

```
┌─────────────────────────────────────────────┐
│ User clicks "Connect"                       │
└─────────────┬───────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────┐
│ Next.js API Route generates OAuth URL      │
│ • /api/google-calendar/[accountId]/auth-url│
│ • Frontend constructs Sikka URL directly   │
└─────────────┬───────────────────────────────┘
              │
              ↓ window.location.href (same window)
┌─────────────────────────────────────────────┐
│ OAuth Provider (Google / Sikka)            │
│ User grants permissions                     │
└─────────────┬───────────────────────────────┘
              │
              ↓ Redirect with code
┌─────────────────────────────────────────────┐
│ Next.js API Route handles callback         │
│ • /api/google-calendar/callback            │
│ • /api/pms/sikka/oauth/callback           │
└─────────────┬───────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────┐
│ Processes tokens & saves to database       │
│ • Google: Direct to Prisma                 │
│ • Sikka: Calls backend API first           │
└─────────────┬───────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────┐
│ Redirects to success page                  │
│ Shows "Connected ✅" toast                  │
└─────────────────────────────────────────────┘
```

## Files Structure

### Frontend API Routes

```
apps/frontend/apps/web/app/api/
├── google-calendar/
│   ├── [accountId]/
│   │   ├── auth-url/route.ts          ✅ Generate OAuth URL
│   │   └── disconnect/route.ts        ✅ Disconnect
│   └── callback/route.ts              ✅ Handle OAuth callback
└── pms/
    ├── sikka/oauth/callback/route.ts  ✅ Handle Sikka callback
    └── connection-status/route.ts     (existing)
```

### Backend API Endpoints

```
apps/backend/src/
├── google-calendar/
│   ├── google-calendar.controller.ts  (not used for OAuth)
│   └── google-calendar.service.ts     (for future event creation)
└── pms/
    ├── pms.controller.ts              ✅ /sikka/exchange-code
    └── pms.service.ts                 ✅ handleSikkaOAuthCallback()
```

## Benefits

### ✅ Consistent Architecture
- Both use Next.js API routes
- Same pattern, easier to maintain
- Clear separation of concerns

### ✅ Better User Experience
- Same-window redirect (no popups)
- Faster and smoother
- No popup blockers

### ✅ Simpler Implementation
- NextAuth handles authentication
- No JWT token management
- No CORS issues

### ✅ Security
- Tokens never exposed to browser
- Server-side processing
- Proper state validation

## Troubleshooting

### Google Calendar Issues

**"Failed to get authorization URL"**
- Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`
- Restart frontend dev server

**"Redirect URI mismatch"**
- Verify redirect URI in Google Console matches exactly
- No trailing slash, correct protocol (http/https)

**"Not connected after OAuth"**
- Check browser console for errors
- Verify database has `googleCalendarConnected=true`

### Sikka PMS Issues

**"404 on callback"**
- Frontend API route should exist at `/api/pms/sikka/oauth/callback`
- Check file was created correctly

**"Backend exchange failed"**
- Verify backend is running on port 3333
- Check `SIKKA_APP_ID` and `SIKKA_APP_KEY` in backend .env
- Look at backend logs for details

**"State expired"**
- OAuth took > 10 minutes
- User needs to restart the flow

**"No authorized practices"**
- User didn't grant permission in Sikka
- Check practice is properly connected

## Production Deployment

### Update Redirect URIs

**In Google Cloud Console**:
```
https://yourdomain.com/api/google-calendar/callback
```

**In Sikka Portal**:
```
https://yourdomain.com/api/pms/sikka/oauth/callback
```

### Update Environment Variables

**Frontend**:
```bash
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/google-calendar/callback
NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com/api
```

**Backend**:
```bash
APP_BASE_URL=https://yourdomain.com
```

## Documentation

- **Complete Guide**: `docs/GOOGLE_CALENDAR_ARCHITECTURE_FINAL.md`
- **Sikka Migration**: `docs/SIKKA_OAUTH_MOVED_TO_FRONTEND.md`
- **OAuth Architecture**: `docs/OAUTH_REDIRECT_URI_ARCHITECTURE.md`

## Status

✅ **Google Calendar** - Frontend OAuth complete  
✅ **Sikka PMS** - Moved to frontend OAuth  
✅ **Consistent pattern** - Both use Next.js  
✅ **Same-window flow** - Best UX  
✅ **Ready for testing**

---

**Next Action**: Add OAuth credentials and test! 🚀
