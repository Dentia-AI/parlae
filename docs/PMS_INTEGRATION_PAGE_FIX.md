# PMS Integration Page Fix

## Summary
Fixed the PMS integration flow to be a sub-component within the Integrations page (step 3), eliminating the extra step 5 that was appearing in the stepper.

## Changes Made

### 1. Removed Separate PMS Route
- **Deleted**: `/apps/frontend/apps/web/app/home/(user)/agent/setup/pms/page.tsx`
- The PMS setup is no longer a separate route with its own stepper

### 2. Updated PMS Setup Wizard Component
**File**: `/apps/frontend/apps/web/app/home/(user)/agent/setup/_components/pms-setup-wizard.tsx`

- Replaced old marketplace flow with Sikka OAuth flow
- Updated connection status checks to use new backend API
- Modified instructions to reflect the 3-step process:
  1. Install Sikka SPU
  2. Authorize via Sikka OAuth
  3. Verify Connection

### 3. Integrated Wizard into Integrations Page
**File**: `/apps/frontend/apps/web/app/home/(user)/agent/setup/integrations/page.tsx`

- Added state management (`showPmsSetup`) to toggle between integrations list and PMS setup wizard
- Wizard now renders as a sub-component when "Connect PMS" is clicked
- Added "Back to Integrations" button to return from wizard
- Handles OAuth callback redirects (`?status=success` or `?status=error`)

### 4. Created Connection Status API Route
**File**: `/apps/frontend/apps/web/app/api/pms/connection-status/route.ts`

- Proxies requests to backend
- Accepts `accountId` as query parameter
- Returns connection status, practice name, and error details

### 5. Updated Backend Endpoints
**File**: `/apps/backend/src/pms/pms.controller.ts`

- Updated `connection-status` endpoint to accept `accountId` query param
- Fixed OAuth callback redirects to go to `/home/agent/setup/integrations` instead of `/home/agent/setup/pms`
- Changed redirect status from `connecting` to `success` on successful OAuth

**File**: `/apps/backend/src/pms/pms.service.ts`

- Updated `getConnectionStatus()` method to accept `accountId` directly instead of `userId`
- Simplified logic to query database directly by `accountId`

## User Flow

### Before Fix
1. Step 3: Integrations page
2. Click "Connect PMS" → **Navigates to new page with step 5**
3. Extra step appears in stepper
4. Inconsistent layout

### After Fix
1. Step 3: Integrations page
2. Click "Connect PMS" → **Shows wizard within same page (no navigation)**
3. Follow 3-step process in wizard:
   - Install SPU
   - Click "Authorize via Sikka" (OAuth redirect)
   - Return to same page, click "Check Connection"
4. Click "Back to Integrations" to return to integrations list
5. Stepper remains on step 3 throughout

## OAuth Flow

```
[Frontend: Integrations Page]
  ↓ User clicks "Authorize via Sikka"
[Redirect to: https://api.sikkasoft.com/portal/authapp.aspx]
  ↓ User authorizes
[Backend: /api/pms/sikka/oauth/callback?code=XXX&state=YYY]
  ↓ Exchange code for credentials
  ↓ Store in Secrets Manager
  ↓ Save to database
[Redirect to: /home/agent/setup/integrations?status=success]
  ↓ PMS wizard auto-displays
  ↓ User clicks "Check Connection"
[Frontend: /api/pms/connection-status?accountId=XXX]
  ↓ Backend checks database
[Result: Connected ✓]
```

## Key Benefits

1. **Consistent Layout**: PMS setup uses same layout as other setup pages
2. **No Extra Steps**: Stepper stays on step 3 throughout PMS connection
3. **Better UX**: Sub-component approach feels more integrated
4. **Cleaner Navigation**: No separate route, no page reloads
5. **OAuth Integration**: Proper Sikka OAuth flow with state management

## Testing Checklist

- [ ] Click "Connect PMS" from Integrations page
- [ ] Verify wizard displays without navigation
- [ ] Verify stepper doesn't show extra step
- [ ] Click "Authorize via Sikka"
- [ ] Complete OAuth flow
- [ ] Return to Integrations page
- [ ] Verify success toast appears
- [ ] Click "Check Connection"
- [ ] Verify connection status updates
- [ ] Click "Back to Integrations"
- [ ] Verify returns to integrations list
- [ ] Verify can navigate to next step (Phone Integration)

## Environment Variables Required

### Frontend (.env.local)
```bash
NEXT_PUBLIC_SIKKA_APP_ID=your_sikka_app_id
```

### Backend (.env)
```bash
SIKKA_APP_ID=your_sikka_app_id
SIKKA_APP_KEY=your_sikka_app_key
APP_BASE_URL=https://app.parlae.ca
```
