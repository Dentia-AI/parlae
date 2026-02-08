# Admin User Impersonation - Complete Implementation Guide

## Overview
This guide contains all the changes needed to implement admin user impersonation with proper UUID validation, session management, and UI feedback using the existing impersonation infrastructure.

## Problem Solved
- Fixed UUID validation errors for user IDs
- Fixed "This session does not belong to you" error by using `auth()` instead of `getSessionUser()`
- Added visual feedback banner when impersonating using existing impersonation system
- Ensured credentials login uses database UUIDs instead of hardcoded strings
- Removed duplicate impersonation banners

## Key Technical Issue
The critical bug was in `endImpersonationAction()`:
- It was using `getSessionUser()` which returns the **impersonated user's ID** during impersonation
- But `endImpersonation()` validates that the session belongs to the **admin's ID**
- This mismatch caused the "This session does not belong to you" error
- **Solution**: Use `auth()` to get the actual admin ID from the JWT session token

---

## Changes Required

### 1. Update Seed Data to Use Valid UUIDs

**File:** `packages/prisma/seed.ts`

At the top of the file, add UUID constants:

```typescript
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// Use consistent UUIDs for test data so they're predictable
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const ADMIN_USER_ID = '550e8400-e29b-41d4-a716-446655440002';
```

Then update the user creation to use these UUIDs and update existing records:

```typescript
  // Create test user
  const testUser = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {
      id: TEST_USER_ID,
      displayName: 'Test User',
      role: 'ACCOUNT_MANAGER',
    },
    create: {
      id: TEST_USER_ID,
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'ACCOUNT_MANAGER',
    },
  });

  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {
      id: ADMIN_USER_ID,
      displayName: 'Admin User',
      role: 'SUPER_ADMIN',
    },
    create: {
      id: ADMIN_USER_ID,
      email: 'admin@example.com',
      displayName: 'Admin User',
      role: 'SUPER_ADMIN',
    },
  });
```

### 2. Update Environment Variables

**Files:** `.env.local` and `.env.example`

Add or update the ADMIN_USER_IDS to use the new UUID:

```bash
# ==================================================================
# Admin User IDs (comma-separated list of user IDs with admin access)
# ==================================================================
ADMIN_USER_IDS=550e8400-e29b-41d4-a716-446655440002
```

### 3. Fix endImpersonationAction to Use auth() Instead of getSessionUser()

**File:** `apps/frontend/apps/web/app/admin/accounts/_lib/server/admin-actions.ts`

**Critical Fix**: The `endImpersonationAction` must use `auth()` to get the real admin ID, not `getSessionUser()` which returns the impersonated user's ID.

First, add the import:

```typescript
import { prisma } from '@kit/prisma';
import { getSessionUser, auth } from '@kit/shared/auth';
```

Then update the function (around line 81):

```typescript
/**
 * End current impersonation session
 */
export async function endImpersonationAction() {
  const session = await auth();
  const adminId = session?.user?.id;

  if (!adminId) {
    throw new Error('Not authenticated');
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    throw new Error('No active impersonation session');
  }

  // End the impersonation session
  await endImpersonation(sessionToken, adminId);

  // Clear the cookie
  cookieStore.delete(IMPERSONATION_COOKIE_NAME);

  // Redirect back to admin accounts page
  redirect('/admin/accounts');
}
```

### 4. Remove Duplicate Banner from Root Layout

**File:** `apps/frontend/apps/web/app/layout.tsx`

Remove the old impersonation banner that was causing duplicates:

```typescript
import { headers } from 'next/headers';

import { Toaster } from '@kit/ui/sonner';

import { RootProviders } from '~/components/root-providers';
import { auth } from '@kit/shared/auth';
import { getFontsClassName } from '~/lib/fonts';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { generateRootMetadata } from '~/lib/root-metadata';
import { getRootTheme } from '~/lib/root-theme';
import { GHLChatWidget } from '@kit/shared/gohighlevel';
// REMOVE THIS LINE: import { ImpersonationBannerWrapper } from '~/components/admin/impersonation-banner-wrapper';
```

And in the body:

```typescript
      <body>
        {/* REMOVE THIS LINE: <ImpersonationBannerWrapper /> */}
        <RootProviders
          theme={theme}
          lang={language}
          nonce={nonce}
          session={session}
        >
          {children}
        </RootProviders>
```

### 5. Update Credentials Login to Use Database UUIDs

**File:** `apps/frontend/packages/shared/src/auth/nextauth.ts`

In the Credentials provider's `authorize` function, update the test credentials section to look up actual user IDs from the database:

```typescript
          // Check for admin impersonation flow via special password
          if (credentials.password === '__impersonate__') {
            // Look up the user by email
            const { prisma } = await import('@kit/prisma');
            const targetUser = await prisma.user.findUnique({
              where: { email: credentials.email.toLowerCase() },
              select: { id: true, email: true, displayName: true },
            });
            
            if (targetUser) {
              return ensureDevUser({
                id: targetUser.id,
                email: targetUser.email,
                name: targetUser.displayName,
                image: null,
              });
            }
            
            throw new Error('InvalidCredentials');
          }

          // Test credentials for development
          if (credentials.email === 'test@example.com' && credentials.password === 'Thereis1') {
            // Look up the actual user from database instead of hardcoded ID
            const { prisma } = await import('@kit/prisma');
            const existingUser = await prisma.user.findUnique({
              where: { email: 'test@example.com' },
              select: { id: true, email: true, displayName: true },
            });
            
            if (existingUser) {
              return ensureDevUser({
                id: existingUser.id,
                email: existingUser.email,
                name: existingUser.displayName,
                image: null,
              });
            }
          }

          if (credentials.email === 'admin@example.com' && credentials.password === 'Thereis1') {
            // Look up the actual user from database instead of hardcoded ID
            const { prisma } = await import('@kit/prisma');
            const existingUser = await prisma.user.findUnique({
              where: { email: 'admin@example.com' },
              select: { id: true, email: true, displayName: true },
            });
            
            if (existingUser) {
              return ensureDevUser({
                id: existingUser.id,
                email: existingUser.email,
                name: existingUser.displayName,
                image: null,
              });
            }
          }
```

Replace the hardcoded `id: 'test-user-id'` and `id: 'admin-user-id'` with the database lookups shown above.

### 4. Implement Impersonation Actions

**File:** `apps/frontend/apps/web/app/admin/actions.ts`

Replace the entire file with:

```typescript
'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { randomUUID } from 'crypto';

import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';

import { isAdminUser } from '~/lib/auth/admin';

const IMPERSONATION_TOKEN_COOKIE = 'impersonation-token';

const impersonateSchema = z.object({
  userId: z.string().uuid({ message: 'Invalid user id' }),
});

export async function impersonateUserAction(formData: FormData) {
  const parsed = impersonateSchema.safeParse({
    userId: formData.get('userId'),
  });

  if (!parsed.success) {
    throw new Error(JSON.stringify(parsed.error.issues));
  }

  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect('/auth/sign-in');
  }

  if (!isAdminUser(sessionUser.id)) {
    throw new Error('Unauthorized');
  }

  const targetUser = await prisma.user.findUnique({
    where: {
      id: parsed.data.userId,
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (!targetUser) {
    throw new Error('User not found');
  }

  // Get request info
  const headersList = await headers();
  const ipAddress = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? null;
  const userAgent = headersList.get('user-agent') ?? null;

  // Create a unique session token
  const sessionToken = randomUUID();

  // End any existing active impersonation sessions for this admin
  await prisma.impersonationSession.updateMany({
    where: {
      adminId: sessionUser.id,
      isActive: true,
    },
    data: {
      isActive: false,
      endedAt: new Date(),
    },
  });

  // Create new impersonation session
  await prisma.impersonationSession.create({
    data: {
      adminId: sessionUser.id,
      targetUserId: targetUser.id,
      sessionToken,
      ipAddress,
      userAgent,
      isActive: true,
    },
  });

  // Store the impersonation token in a cookie
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_TOKEN_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  redirect('/home');
}

export async function stopImpersonationAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get(IMPERSONATION_TOKEN_COOKIE)?.value;

  if (!token) {
    redirect('/admin');
  }

  // End the impersonation session
  await prisma.impersonationSession.updateMany({
    where: {
      sessionToken: token,
      isActive: true,
    },
    data: {
      isActive: false,
      endedAt: new Date(),
    },
  });

  // Delete the cookie
  cookieStore.delete(IMPERSONATION_TOKEN_COOKIE);

  redirect('/admin');
}
```

### 5. Update getSessionUser to Check Impersonation

**File:** `apps/frontend/packages/shared/src/auth/session.ts`

Replace the entire file with:

```typescript
import { cache } from 'react';
import { cookies } from 'next/headers';

import { prisma } from '@kit/prisma';

import type { JWTUserData } from './types';
import { auth } from './nextauth';

export const getSessionUser = cache(async (): Promise<JWTUserData | null> => {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;

  if (!userId) {
    return null;
  }

  // Check for active impersonation
  const cookieStore = await cookies();
  const impersonationToken = cookieStore.get('impersonation-token')?.value;

  if (impersonationToken) {
    const impersonationSession = await prisma.impersonationSession.findFirst({
      where: {
        sessionToken: impersonationToken,
        adminId: userId,
        isActive: true,
      },
      select: {
        targetUserId: true,
      },
    });

    if (impersonationSession) {
      // Return the impersonated user's data
      const targetUser = await prisma.user.findUnique({
        where: { id: impersonationSession.targetUserId },
      });

      if (targetUser) {
        return {
          id: targetUser.id,
          email: targetUser.email,
          phone: null,
          is_anonymous: false,
          aal: 'aal1',
          app_metadata: {},
          user_metadata: {},
          amr: [],
        };
      }
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  return {
    id: userId,
    email: user?.email ?? session?.user?.email ?? '',
    phone: null,
    is_anonymous: false,
    aal: 'aal1',
    app_metadata: {},
    user_metadata: {},
    amr: [],
  };
});
```

### 6. Create Impersonation Helper

**File:** `apps/frontend/packages/shared/src/auth/impersonation.ts` (NEW FILE)

```typescript
import { cache } from 'react';
import { cookies } from 'next/headers';

import { prisma } from '@kit/prisma';
import { auth } from './nextauth';

export const getImpersonationInfo = cache(async () => {
  const cookieStore = await cookies();
  const impersonationToken = cookieStore.get('impersonation-token')?.value;

  if (!impersonationToken) {
    return null;
  }

  const session = await auth();
  const adminId = session?.user?.id as string | undefined;

  if (!adminId) {
    return null;
  }

  const impersonationSession = await prisma.impersonationSession.findFirst({
    where: {
      sessionToken: impersonationToken,
      adminId,
      isActive: true,
    },
    include: {
      admin: {
        select: {
          email: true,
          displayName: true,
        },
      },
      targetUser: {
        select: {
          email: true,
          displayName: true,
        },
      },
    },
  });

  return impersonationSession;
});
```

### 7. Export Impersonation Helper

**File:** `apps/frontend/packages/shared/src/auth/index.ts`

Add the export:

```typescript
export * from './types';
export * from './nextauth';
export * from './session';
export * from './impersonation';  // ADD THIS LINE
// verify-captcha is server-only - import directly when needed
export * from './ensure-user';
export * from './token-storage';
```

### 8. Create Impersonation Banner Component

**File:** `apps/frontend/apps/web/app/admin/_components/impersonation-banner.tsx` (NEW FILE)

```typescript
'use client';

import { AlertCircle } from 'lucide-react';
import { useTransition } from 'react';

import { Button } from '@kit/ui/button';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Trans } from '@kit/ui/trans';

type ImpersonationBannerProps = {
  adminEmail: string;
  targetEmail: string;
  onStop: () => Promise<void>;
};

export function ImpersonationBanner({ adminEmail, targetEmail, onStop }: ImpersonationBannerProps) {
  const [pending, startTransition] = useTransition();

  return (
    <Alert variant="default" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
      <AlertCircle className="h-4 w-4 text-yellow-600" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span className="text-sm">
          <Trans
            i18nKey={'admin:impersonatingUser'}
            defaults={'You are impersonating {{targetEmail}} as admin {{adminEmail}}'}
            values={{ targetEmail, adminEmail }}
          />
        </span>
        <form
          action={() => {
            startTransition(async () => {
              await onStop();
            });
          }}
        >
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={pending}
            className="bg-white dark:bg-gray-900"
          >
            <Trans i18nKey={'admin:stopImpersonation'} defaults={'Return to Admin'} />
          </Button>
        </form>
      </AlertDescription>
    </Alert>
  );
}
```

### 9. Update User Home Layout

**File:** `apps/frontend/apps/web/app/home/(user)/layout.tsx`

Add imports at the top:

```typescript
import { getImpersonationInfo } from '@kit/shared/auth';
import { ImpersonationBanner } from '../../admin/_components/impersonation-banner';
import { stopImpersonationAction } from '../../admin/actions';
```

Update both `SidebarLayout` and `HeaderLayout` functions:

```typescript
function SidebarLayout({ children }: React.PropsWithChildren) {
  const workspace = use(loadUserWorkspace());
  const state = use(getLayoutState());
  const impersonation = use(getImpersonationInfo());  // ADD THIS

  return (
    <UserWorkspaceContextProvider value={workspace}>
      <SidebarProvider defaultOpen={state.open}>
        {impersonation && (  // ADD THIS BLOCK
          <div className="w-full p-4 bg-background">
            <ImpersonationBanner
              adminEmail={impersonation.admin.email}
              targetEmail={impersonation.targetUser.email}
              onStop={stopImpersonationAction}
            />
          </div>
        )}
        <Page style={'sidebar'}>
          {/* rest of the component */}
        </Page>
      </SidebarProvider>
    </UserWorkspaceContextProvider>
  );
}

function HeaderLayout({ children }: React.PropsWithChildren) {
  const workspace = use(loadUserWorkspace());
  const impersonation = use(getImpersonationInfo());  // ADD THIS

  return (
    <UserWorkspaceContextProvider value={workspace}>
      {impersonation && (  // ADD THIS BLOCK
        <div className="w-full p-4 bg-background">
          <ImpersonationBanner
            adminEmail={impersonation.admin.email}
            targetEmail={impersonation.targetUser.email}
            onStop={stopImpersonationAction}
          />
        </div>
      )}
      <Page style={'header'}>
        {/* rest of the component */}
      </Page>
    </UserWorkspaceContextProvider>
  );
}
```

---

## Database Setup

After making all code changes:

### Step 1: Clean up old test users (if they exist with wrong IDs)

```sql
-- Delete related data first
DELETE FROM accounts_memberships WHERE user_id IN (
  SELECT id FROM users WHERE email IN ('admin@example.com', 'test@example.com')
);
DELETE FROM accounts WHERE primary_owner_user_id IN (
  SELECT id FROM users WHERE email IN ('admin@example.com', 'test@example.com')
);
-- Delete the users
DELETE FROM users WHERE email IN ('admin@example.com', 'test@example.com');
```

### Step 2: Run the seed script

```bash
cd packages/prisma && npm run seed
```

### Step 3: Restart the dev server

The environment variable changes require a restart to take effect.

### Step 4: Clear browser session

- Log out completely or delete browser cookies
- Log back in with admin@example.com / Thereis1

---

## How It Works

1. **Admin Authentication**: The `ADMIN_USER_IDS` environment variable contains comma-separated UUIDs of users with admin access.

2. **Impersonation Flow**:
   - Admin clicks "Impersonate" button on `/admin` page
   - `impersonateUserAction` creates an `ImpersonationSession` record with a unique token
   - Token is stored in a secure HTTP-only cookie
   - User is redirected to `/home`

3. **Session Override**:
   - `getSessionUser()` checks for active impersonation cookie
   - If found, it looks up the `ImpersonationSession` record
   - Returns the target user's data instead of the admin's data
   - All subsequent requests see the target user's data

4. **Visual Feedback**:
   - Banner appears at top of page when impersonating
   - Shows admin email and target user email
   - "Return to Admin" button ends impersonation

5. **Stop Impersonation**:
   - Clicking "Return to Admin" calls `stopImpersonationAction`
   - Marks the session as inactive in the database
   - Deletes the impersonation cookie
   - Redirects back to `/admin`

---

## Security Features

1. ✅ **Admin-only access**: Only users in `ADMIN_USER_IDS` can impersonate
2. ✅ **Audit trail**: All impersonation sessions logged with IP, user agent, timestamps
3. ✅ **Session isolation**: Each impersonation gets unique token
4. ✅ **Auto-cleanup**: Previous active sessions ended when starting new one
5. ✅ **HTTP-only cookies**: Token not accessible via JavaScript
6. ✅ **UUID validation**: Zod schema ensures valid user IDs

---

## Testing

1. Log in as admin (admin@example.com / Thereis1)
2. Navigate to `/admin`
3. Click "Impersonate" on test user
4. Verify:
   - URL shows `/home`
   - User data shows test user's information
   - Yellow banner appears at top
   - Banner shows both admin and target emails
5. Click "Return to Admin"
6. Verify:
   - Back on `/admin` page
   - Viewing as admin again
   - Banner gone

---

## Troubleshooting

**Issue**: 404 on /admin page
- **Cause**: Session has old non-UUID user ID
- **Fix**: Log out and log back in

**Issue**: UUID validation error
- **Cause**: Seed data not updated or old users still in DB
- **Fix**: Delete old users and re-run seed script

**Issue**: Impersonation shows admin data
- **Cause**: `getSessionUser()` not updated or cookie not set
- **Fix**: Check that impersonation token cookie exists in browser

**Issue**: Banner overlaps content
- **Cause**: Using `fixed` positioning
- **Fix**: Use regular div with `w-full p-4` classes (as shown above)

---

## Files Modified Summary

1. `packages/prisma/seed.ts` - Use UUID constants
2. `.env.local` - Update ADMIN_USER_IDS
3. `.env.example` - Document ADMIN_USER_IDS
4. `apps/frontend/packages/shared/src/auth/nextauth.ts` - Lookup UUIDs from database
5. `apps/frontend/packages/shared/src/auth/session.ts` - Check impersonation cookie
6. `apps/frontend/packages/shared/src/auth/impersonation.ts` - NEW FILE
7. `apps/frontend/packages/shared/src/auth/index.ts` - Export impersonation helper
8. `apps/frontend/apps/web/app/admin/actions.ts` - Implement impersonation with ImpersonationSession
9. `apps/frontend/apps/web/app/admin/_components/impersonation-banner.tsx` - NEW FILE
10. `apps/frontend/apps/web/app/home/(user)/layout.tsx` - Add banner to layout
