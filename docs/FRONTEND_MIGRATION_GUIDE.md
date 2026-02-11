# Frontend Migration Guide

## Overview

After the backend refactor, the frontend needs minimal updates to call backend endpoints instead of local API routes for PMS operations.

## Changes Required

### 1. Update PMS Setup Page

**File**: `/apps/frontend/apps/web/app/home/(user)/agent/setup/pms/page.tsx`

**Before**:
```typescript
const response = await fetch('/api/pms/setup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider, credentials, config })
});
```

**After**:
```typescript
// Get session to get JWT token
const session = await getServerSession(authOptions);
const token = session?.accessToken; // or session?.user?.accessToken

const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/pms/setup`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ provider, credentials, config })
});
```

### 2. Update Environment Variables

**File**: `/apps/frontend/apps/web/.env.local`

Add:
```bash
# Backend API URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000

# For production:
# NEXT_PUBLIC_BACKEND_URL=https://api.parlae.ai
```

### 3. Create Backend API Client Helper

**File**: `/apps/frontend/apps/web/lib/backend-client.ts` (NEW)

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '~/config/auth.config';

export async function backendFetch(
  endpoint: string,
  options: RequestInit = {}
) {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;

  if (!token) {
    throw new Error('Not authenticated');
  }

  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
  const url = `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Backend request failed');
  }

  return response.json();
}
```

**Usage**:
```typescript
import { backendFetch } from '~/lib/backend-client';

// Setup PMS
const result = await backendFetch('/pms/setup', {
  method: 'POST',
  body: JSON.stringify({ provider, credentials })
});

// Get PMS status
const status = await backendFetch('/pms/status');
```

### 4. Update PMS Setup Component (OPTIONAL - Client-side)

If you want to call from client components, create a client-side version:

**File**: `/apps/frontend/apps/web/lib/backend-client-browser.ts` (NEW)

```typescript
export async function backendFetchClient(
  endpoint: string,
  options: RequestInit = {}
) {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
  const url = `${baseUrl}${endpoint}`;

  // Get token from session on client-side
  // You'll need to pass it as a parameter or get it from context
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // Send cookies if using cookie-based auth
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Backend request failed');
  }

  return response.json();
}
```

## Quick Implementation Plan

### Step 1: Add Backend URL to Environment
```bash
cd apps/frontend/apps/web
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:4000" >> .env.local
```

### Step 2: Create Backend Client Helper
Create the file `/apps/frontend/apps/web/lib/backend-client.ts` with the code above.

### Step 3: Update PMS Setup Action (Recommended approach)

**File**: `/apps/frontend/apps/web/app/home/(user)/agent/setup/_lib/pms-actions.ts` (NEW)

```typescript
'use server';

import { backendFetch } from '~/lib/backend-client';

export async function setupPmsIntegration(data: {
  provider: string;
  credentials: Record<string, any>;
  config?: Record<string, any>;
}) {
  return backendFetch('/pms/setup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getPmsStatus() {
  return backendFetch('/pms/status');
}
```

### Step 4: Use in PMS Setup Page

**File**: `/apps/frontend/apps/web/app/home/(user)/agent/setup/pms/page.tsx`

```typescript
import { setupPmsIntegration, getPmsStatus } from '../_lib/pms-actions';

// In your form submit handler:
const handleSubmit = async (data: FormData) => {
  try {
    const result = await setupPmsIntegration({
      provider: data.get('provider') as string,
      credentials: JSON.parse(data.get('credentials') as string),
    });
    
    if (result.success) {
      toast.success('PMS connected successfully!');
    }
  } catch (error) {
    toast.error(error.message);
  }
};
```

## No Changes Needed

The following still work as-is (they're setup operations, not webhooks):

- ✅ `/app/api/vapi/templates` - List templates
- ✅ `/app/api/vapi/phone-numbers` - Phone number management
- ✅ `/app/api/twilio/phone/*` - Twilio phone operations
- ✅ `/app/api/agent/*` - Agent setup
- ✅ `/app/api/admin/*` - Admin operations

These don't need backend calls because:
1. They're user-initiated setup operations
2. They don't handle sensitive PMS data
3. They're not webhooks that need to run during calls

## Testing Checklist

- [ ] Backend is running on port 4000
- [ ] Frontend has `NEXT_PUBLIC_BACKEND_URL` set
- [ ] Created `backend-client.ts` helper
- [ ] Created `pms-actions.ts` server actions
- [ ] Updated PMS setup page to use new actions
- [ ] Test PMS setup flow end-to-end
- [ ] Verify JWT token is being sent
- [ ] Check backend logs for successful requests

## Troubleshooting

### "Not authenticated" error
**Problem**: JWT token not found
**Solution**: Make sure NextAuth is configured to return `accessToken` in session

```typescript
// In auth.config.ts
callbacks: {
  async jwt({ token, account }) {
    if (account) {
      token.accessToken = account.access_token;
    }
    return token;
  },
  async session({ session, token }) {
    session.accessToken = token.accessToken;
    return session;
  },
}
```

### CORS errors
**Problem**: Browser blocking requests to backend
**Solution**: Backend already has CORS enabled for frontend origin. If still having issues, check backend logs.

### 401 Unauthorized from backend
**Problem**: Backend can't verify JWT token
**Solution**: 
1. Verify `COGNITO_USER_POOL_ID` is set in backend
2. Verify JWT token format is correct
3. Check token expiry

### Connection refused
**Problem**: Backend not running
**Solution**: Start backend with `cd apps/backend && npm run start:dev`

## Minimal Changes Summary

If you want the absolute minimum changes:

1. Add `NEXT_PUBLIC_BACKEND_URL` to `.env.local`
2. Create `lib/backend-client.ts` helper
3. Update only the PMS setup to call backend
4. Everything else stays the same

**That's it!** The refactor is mostly complete on the backend. Frontend changes are minimal.

---

**Estimated Time**: 30 minutes  
**Complexity**: Low  
**Breaking Changes**: None (backwards compatible)
