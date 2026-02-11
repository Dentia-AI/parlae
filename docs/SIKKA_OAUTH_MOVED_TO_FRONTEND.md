# Sikka OAuth Moved to Frontend ✅

## Summary

Sikka PMS OAuth flow has been moved to the **Frontend (Next.js)** to match the Google Calendar pattern.

## Architecture

### Before (Broken)
```
Frontend → Sikka OAuth → ??? → 404 Error
```
- Frontend pointed to: `http://localhost:3000/api/pms/sikka/oauth/callback` ❌
- Route didn't exist

### After (Fixed) ✅
```
Frontend → Sikka OAuth → Next.js Callback → Backend API → Database
```
- Next.js handles redirect: `http://localhost:3000/api/pms/sikka/oauth/callback` ✅
- Backend processes token exchange
- Same pattern as Google Calendar

## Flow Diagram

```
┌─────────────────────────────────────────────┐
│ 1. User clicks "Connect PMS"                │
│    in pms-setup-wizard.tsx                  │
└─────────────┬───────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────┐
│ 2. Frontend constructs OAuth URL            │
│    Redirect URI:                            │
│    http://localhost:3000/api/pms/sikka/     │
│    oauth/callback                           │
└─────────────┬───────────────────────────────┘
              │
              ↓ window.location.href (same window)
┌─────────────────────────────────────────────┐
│ 3. Sikka OAuth Consent Screen               │
│    User authorizes PMS access               │
└─────────────┬───────────────────────────────┘
              │
              ↓ Redirect with code
┌─────────────────────────────────────────────┐
│ 4. Next.js API Route                        │
│    /api/pms/sikka/oauth/callback           │
│                                             │
│    • Receives OAuth code                    │
│    • Validates state (timestamp check)      │
│    • Calls backend API                      │
└─────────────┬───────────────────────────────┘
              │
              ↓ POST /pms/sikka/exchange-code
┌─────────────────────────────────────────────┐
│ 5. Backend NestJS API                       │
│    /pms/sikka/exchange-code                │
│                                             │
│    • Exchanges code for request_key         │
│    • Gets authorized practices              │
│    • Stores in AWS Secrets Manager          │
│    • Saves integration in database          │
└─────────────┬───────────────────────────────┘
              │
              ↓ Returns success
┌─────────────────────────────────────────────┐
│ 6. Next.js Redirects to:                    │
│    /integrations?status=success&provider=   │
│    sikka                                    │
└─────────────┬───────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────┐
│ 7. Frontend shows "Connected ✅" toast      │
└─────────────────────────────────────────────┘
```

## Files Created/Modified

### ✅ Created

**Frontend API Route**:
```
apps/frontend/apps/web/app/api/pms/sikka/oauth/callback/route.ts
```
- Handles Sikka OAuth redirect
- Validates state parameter
- Calls backend to exchange code
- Redirects to integrations page

### ✅ Modified

**Backend Controller**:
```
apps/backend/src/pms/pms.controller.ts
```
- Added `@Post('sikka/exchange-code')` endpoint
- Kept old callback for backwards compatibility (marked deprecated)

**Frontend Integration Page**:
```
apps/frontend/apps/web/app/home/(user)/agent/setup/integrations/page.tsx
```
- Added Sikka-specific OAuth callback handling
- Shows success/error toasts for Sikka
- Sets `pmsConnectionStatus='connected'` on success

**Frontend PMS Wizard**:
```
apps/frontend/apps/web/app/home/(user)/agent/setup/_components/pms-setup-wizard.tsx
```
- Already had correct redirect URI! ✅
- Uses: `${window.location.origin}/api/pms/sikka/oauth/callback`

## Redirect URIs

### Development

**Sikka Portal Configuration**:
```
http://localhost:3000/api/pms/sikka/oauth/callback
```

### Production (Ngrok)

**Sikka Portal Configuration**:
```
https://matterless-eartha-unraffled.ngrok-free.dev/api/pms/sikka/oauth/callback
```

### Production (Final Domain)

**Sikka Portal Configuration**:
```
https://yourdomain.com/api/pms/sikka/oauth/callback
```

## Backend API

### New Endpoint: Exchange Code

**POST** `/pms/sikka/exchange-code`

**Request**:
```json
{
  "code": "authorization_code_from_sikka",
  "accountId": "account-uuid"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "integration": { /* integration details */ }
}
```

**Response (Error)**:
```json
{
  "success": false,
  "error": "Error message"
}
```

### What It Does:
1. Calls Sikka API to exchange code for `request_key`
2. Fetches authorized practices using `request_key`
3. Stores credentials in AWS Secrets Manager
4. Creates/updates `pmsIntegration` record in database
5. Returns success/error status

## Environment Variables

### Frontend (.env.local)

```bash
# Sikka OAuth
NEXT_PUBLIC_SIKKA_APP_ID=your_sikka_app_id

# Backend URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:3333
```

### Backend (apps/backend/.env)

```bash
# Sikka System Credentials
SIKKA_APP_ID=your_sikka_app_id
SIKKA_APP_KEY=your_sikka_app_key

# For redirects
APP_BASE_URL=http://localhost:3000
```

## Testing

### Test Flow

1. **Start Setup Wizard**:
   - Navigate to `/home/agent/setup/integrations`
   - Click "Connect PMS"

2. **OAuth Flow**:
   - Should redirect to Sikka OAuth page
   - Authorize the application
   - Should redirect back to: `http://localhost:3000/api/pms/sikka/oauth/callback?code=xxx&state=yyy`

3. **Callback Processing**:
   - Next.js route processes the callback
   - Calls backend API to exchange code
   - Backend stores credentials
   - Redirects to: `/integrations?status=success&provider=sikka`

4. **Success**:
   - Should see "Sikka PMS connected successfully!" toast ✅
   - PMS wizard should show connected state

### Debug Logs

Frontend callback logs with `[Sikka OAuth Callback]` prefix:
```
[Sikka OAuth Callback] Received callback
[Sikka OAuth] State data: { accountId: '...', age: 1234 }
[Sikka OAuth] Calling backend to exchange code
[Sikka OAuth] Exchange result: { success: true }
[Sikka OAuth] Success! Redirecting to integrations page
```

Backend logs with `[PmsService]` prefix:
```
[PmsService] Processing Sikka OAuth callback for account xxx
[PmsService] Exchanging authorization code for request_key
[PmsService] Received request_key, expires in 3600 seconds
[PmsService] Fetching authorized practices
[PmsService] Found practice: ABC Dental (Dentrix)
[PmsService] Stored credentials in Secrets Manager
```

### Common Issues

**404 on callback**:
- ✅ Fixed! Route now exists at `/api/pms/sikka/oauth/callback`

**Backend not responding**:
- Check backend is running on port 3333
- Verify `NEXT_PUBLIC_BACKEND_URL` in .env.local

**State expired**:
- OAuth took > 10 minutes
- User needs to restart the flow

**No authorized practices**:
- User didn't grant permission
- PMS not properly connected in Sikka portal

## Comparison: Google Calendar vs Sikka

| Feature | Google Calendar | Sikka PMS |
|---------|----------------|-----------|
| **OAuth Provider** | Google | Sikka |
| **Redirect URI** | `/api/google-calendar/callback` | `/api/pms/sikka/oauth/callback` |
| **Handler** | Next.js API Route | Next.js API Route |
| **Backend Call** | None (direct to DB) | `/pms/sikka/exchange-code` |
| **Token Storage** | Database (Prisma) | AWS Secrets Manager |
| **Same Window** | ✅ Yes | ✅ Yes |
| **Popup Required** | ❌ No | ❌ No |

## Benefits of Frontend Architecture

1. **Consistent Pattern** ✅
   - Both integrations use same approach
   - Easier to maintain

2. **Better UX** ✅
   - Same-window redirect
   - No popup blockers
   - Cleaner flow

3. **Simpler Auth** ✅
   - No JWT tokens needed
   - NextAuth handles everything
   - No CORS issues

4. **Direct DB Access** ✅
   - Prisma available in API routes
   - Can save data directly (if needed)

## Security

### State Parameter
- Contains: `{ accountId, timestamp, nonce }`
- Base64 encoded
- Validated on callback
- Expires after 10 minutes

### Token Exchange
- Happens server-side only
- Credentials never exposed to browser
- Stored securely in AWS Secrets Manager

### Backend Validation
- Verifies account exists
- Checks user permissions
- Validates Sikka response

## Status

✅ **Implementation Complete**
✅ **Same pattern as Google Calendar**
✅ **Backend endpoint added**
✅ **Frontend callback created**
✅ **Integration page updated**
✅ **Ready for testing**

## Next Steps

1. **Update Sikka Portal**:
   - Add redirect URI: `http://localhost:3000/api/pms/sikka/oauth/callback`
   - Test OAuth flow

2. **Production Configuration**:
   - Add production redirect URIs to Sikka portal
   - Update environment variables

3. **Testing**:
   - Test full OAuth flow
   - Verify credentials stored correctly
   - Check database integration record

## Rollback Plan (If Needed)

If you need to revert to backend-handled OAuth:

1. Update `pms-setup-wizard.tsx`:
   ```typescript
   const redirectUri = `http://localhost:3333/pms/sikka/oauth/callback`;
   ```

2. Open OAuth in new tab:
   ```typescript
   window.open(oauthUrl, 'sikka-oauth', 'width=600,height=700');
   ```

3. Implement polling for connection status

But this is **not recommended** - frontend approach is simpler and better!

---

**Architecture**: Frontend ✅  
**Status**: Complete and Ready  
**Pattern**: Matches Google Calendar  
**UX**: Same-window redirect (best practice)
