# Google Calendar Setup Checklist

## ✅ Completed Implementation

All code has been written and is ready to use! Here's what you need to do to activate it:

## 🔧 Setup Steps

### 1. Get Google OAuth Credentials (5 min)

**Go to**: https://console.cloud.google.com/

- [ ] Create new project or select existing
- [ ] Navigate to "APIs & Services" → "Library"
- [ ] Search and enable "Google Calendar API"
- [ ] Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
- [ ] Choose "Web application"
- [ ] Add Authorized redirect URI:
  ```
  http://localhost:3000/api/google-calendar/callback
  ```
- [ ] Click "Create"
- [ ] **Copy the Client ID** (looks like: `123456-abc.apps.googleusercontent.com`)
- [ ] **Copy the Client Secret** (looks like: `GOCSPX-abc123...`)

### 2. Configure Backend Environment (2 min)

**File**: `apps/backend/.env`

Add these three lines:
```bash
GOOGLE_CLIENT_ID=paste_your_client_id_here
GOOGLE_CLIENT_SECRET=paste_your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
```

### 3. Run Database Migration (1 min)

```bash
# From project root
cd packages/prisma
npx prisma migrate deploy
npx prisma generate
cd ../..
```

### 4. Install Dependencies (1 min)

```bash
# From project root
pnpm install --no-frozen-lockfile
```

### 5. Restart Servers (1 min)

```bash
# Kill running servers (Ctrl+C)
# Restart
./dev.sh
```

## 🧪 Testing Steps

### Test 1: Connection Flow

1. [ ] Open browser: http://localhost:3000
2. [ ] Login to app
3. [ ] Go to setup wizard (or navigate to: `/home/agent/setup/integrations`)
4. [ ] Scroll to "Google Calendar" section
5. [ ] Click "Connect Calendar" button
6. [ ] **Expected**: Redirects to Google OAuth consent screen

### Test 2: OAuth Grant

7. [ ] Select your Google account
8. [ ] Click "Allow" to grant calendar access
9. [ ] **Expected**: Redirects back to integrations page
10. [ ] **Expected**: Shows "Connected as your-email@gmail.com"
11. [ ] **Expected**: Button changes to "Disconnect"

### Test 3: Persistence

12. [ ] Refresh the page (F5)
13. [ ] **Expected**: Still shows "Connected"
14. [ ] **Expected**: Email still displays

### Test 4: Disconnect

15. [ ] Click "Disconnect" button
16. [ ] **Expected**: Status resets to "Connect Calendar"

## ✅ Success Criteria

You'll know it's working when:
- ✅ No console errors in browser
- ✅ OAuth redirects smoothly to Google and back
- ✅ "Connected" badge appears after granting access
- ✅ Email displays correctly
- ✅ Connection persists across page reloads

## 🚨 Common Issues

### Issue: "Failed to get authorization URL"
**Fix**: Check backend .env has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### Issue: "Redirect URI mismatch"
**Fix**: 
1. Go to Google Console → Credentials
2. Edit your OAuth client
3. Ensure redirect URI is EXACTLY: `http://localhost:3000/api/google-calendar/callback`
4. No trailing slash, no http**s**

### Issue: Backend won't start
**Fix**: Check backend terminal for errors. Missing env vars?

### Issue: Can't install googleapis
**Fix**: 
```bash
pnpm install googleapis@144 --filter @apps/backend
```

## 📋 Files Modified

### Created
- `apps/backend/src/google-calendar/` (3 files)
- `apps/frontend/apps/web/app/api/google-calendar/callback/route.ts`
- `packages/prisma/migrations/20260211000002_add_google_calendar/`
- `docs/GOOGLE_CALENDAR_*.md` (3 docs)

### Modified
- `packages/prisma/schema.prisma` (added 6 fields)
- `apps/backend/src/app.module.ts` (registered module)
- `apps/backend/package.json` (added googleapis)
- `apps/frontend/apps/web/app/home/(user)/agent/setup/integrations/page.tsx` (added UI)
- `apps/frontend/apps/web/app/home/(user)/agent/setup/_actions/setup-progress-actions.ts` (updated types)

## 🎯 What's Next

After successful testing:

1. **Integrate with Vapi**: Create appointments when patients call
2. **Production Setup**: Add production redirect URI in Google Console
3. **Testing**: Try with different Google accounts
4. **Documentation**: Share with team

## 📞 Integration with Voice Agent (Coming Next)

Once working, you'll add this to your Vapi webhook handler:

```typescript
// When patient books appointment
if (account.googleCalendarConnected) {
  await googleCalendarService.createEvent(accountId, {
    summary: `Appointment: ${patientName}`,
    start: appointmentStart,
    end: appointmentEnd,
    attendees: [patientEmail],
  });
}
```

## ⏱️ Total Setup Time

**Estimated**: 10-15 minutes
**Difficulty**: Easy (mostly copy-paste config)

---

**Ready to Go!** 🚀

Just need the Google OAuth credentials and you're all set!
