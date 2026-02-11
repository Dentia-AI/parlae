# Google Calendar Integration - Fixes Applied ✅

## Issues Fixed

### 1. Database Migration ✅
- Applied migration `20260211000002_add_google_calendar`
- Added 6 new columns to `accounts` table
- Regenerated Prisma client

### 2. Port Configuration ✅
- **Corrected**: Backend runs on port **3333** (not 4000)
- Updated `apps/backend/.env`: `PORT=3333`
- Updated frontend code to use `http://localhost:3333`
- Added `NEXT_PUBLIC_BACKEND_URL=http://localhost:3333` to `.env.local`

### 3. OAuth Redirect URLs 📋

You need to configure these in **Google Cloud Console**:

#### Development (Local)
```
http://localhost:3000/api/google-calendar/callback
```

#### Production (Ngrok)
```
https://matterless-eartha-unraffled.ngrok-free.dev/api/google-calendar/callback
```

#### Production (Final Domain - When Available)
```
https://yourdomain.com/api/google-calendar/callback
```

## Required: Google OAuth Credentials

### Step 1: Get Credentials from Google Cloud Console

1. Go to: https://console.cloud.google.com/
2. Select your project (or create new one)
3. Navigate to: **APIs & Services** → **Library**
4. Search and enable: **Google Calendar API**
5. Go to: **APIs & Services** → **Credentials**
6. Click: **Create Credentials** → **OAuth 2.0 Client ID**
7. Application type: **Web application**
8. Name: `Parlae AI Calendar Integration`
9. **Authorized redirect URIs** - Add ALL of these:
   ```
   http://localhost:3000/api/google-calendar/callback
   https://matterless-eartha-unraffled.ngrok-free.dev/api/google-calendar/callback
   ```
10. Click **Create**
11. **Copy the Client ID and Client Secret**

### Step 2: Add to Backend .env

Open `apps/backend/.env` and replace placeholders:

```bash
# ==================================================================
# Google Calendar (Alternative to PMS for appointment management)
# ==================================================================
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-YourSecretHere
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
```

**For production/ngrok, use**:
```bash
GOOGLE_REDIRECT_URI=https://matterless-eartha-unraffled.ngrok-free.dev/api/google-calendar/callback
```

## Backend Not Running?

The terminal only shows frontend logs. The backend might have failed to start.

### Check Backend Status

```bash
# Check if backend is running
curl http://localhost:3333/api/health

# If not running, check logs
cat logs/backend.log
```

### Restart Everything

```bash
# Kill dev.sh (Ctrl+C)
# Then restart
./dev.sh
```

The backend should start and you'll see logs like:
```
✅ Backend running at http://localhost:3333
```

### If Backend Won't Start

Check `logs/backend.log` for errors. Common issues:
- Missing dependencies → Run `pnpm install`
- Port 3333 already in use → Run `./cleanup.sh`
- Database not ready → Check `docker ps | grep postgres`

## Testing After Setup

### 1. Verify Backend is Running

```bash
curl http://localhost:3333/api/google-calendar/configured

# Should return:
{"configured": true}  # If Google credentials are set
{"configured": false} # If credentials are missing
```

### 2. Test OAuth Flow

1. Navigate to: `http://localhost:3000/home/agent/setup/integrations`
2. Scroll to "Google Calendar" section
3. Click "Connect Calendar"
4. Should redirect to Google OAuth
5. Grant permissions
6. Should redirect back showing "Connected ✅"

### 3. Check Database

```bash
cd packages/prisma
npx prisma studio
```

Look at the `accounts` table → should see new Google Calendar columns

## Status Summary

### ✅ Completed
- [x] Database migration applied
- [x] Prisma client regenerated
- [x] Backend port corrected to 3333
- [x] Frontend updated to use port 3333
- [x] Backend .env template updated
- [x] Frontend .env.local updated

### 📋 Required (You Must Do)
- [ ] Get Google OAuth credentials from Google Cloud Console
- [ ] Add credentials to `apps/backend/.env`
- [ ] Ensure backend is running (`./dev.sh` should start it)
- [ ] Test OAuth flow

## Quick Start Commands

```bash
# 1. Restart dev servers
./dev.sh

# 2. In another terminal, verify backend is up
curl http://localhost:3333/api/health

# 3. Open app
open http://localhost:3000/home/agent/setup/integrations
```

## OAuth Callback URLs Reference

| Environment | Callback URL |
|------------|--------------|
| **Local Dev** | `http://localhost:3000/api/google-calendar/callback` |
| **Ngrok (Current)** | `https://matterless-eartha-unraffled.ngrok-free.dev/api/google-calendar/callback` |
| **Production (Future)** | `https://yourdomain.com/api/google-calendar/callback` |

**Note**: You can add multiple redirect URIs in Google Cloud Console. Add both local and ngrok for flexibility!

## Environment Variables Summary

### Backend (`apps/backend/.env`)
```bash
PORT=3333
APP_BASE_URL=http://localhost:3333
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
```

### Frontend (`.env.local`)
```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:3333
```

## Next Steps

1. **Get Google OAuth credentials** (5 minutes)
2. **Add to backend .env** (1 minute)
3. **Restart servers**: `./dev.sh` (1 minute)
4. **Test connection** (2 minutes)

Total setup time: **~10 minutes**

---

**All code is ready!** Just need the Google credentials to activate the feature. 🚀
