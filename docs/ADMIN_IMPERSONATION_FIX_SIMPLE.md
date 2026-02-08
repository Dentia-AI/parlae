# Admin Impersonation - Critical Fixes

## Problem Summary

The impersonation feature had two critical issues:
1. **UUID validation errors** - Seed data used string IDs instead of UUIDs
2. **"This session does not belong to you" error** - Used wrong function to get admin ID
3. **Duplicate banners** - Two impersonation systems competing

## Root Cause

The critical bug was in `endImpersonationAction()`:
```typescript
// ❌ WRONG - This returns the IMPERSONATED user's ID during impersonation
const session = await getSessionUser();
await endImpersonation(sessionToken, session.id);

// ✅ CORRECT - This returns the actual ADMIN's ID from JWT
const session = await auth();
await endImpersonation(sessionToken, session.user.id);
```

**Why this matters:**
- During impersonation, `getSessionUser()` returns the **target user's** data
- But `endImpersonation()` validates that the session belongs to the **admin**
- This mismatch caused authentication failures

---

## Required Changes

### 1. Fix Seed Data UUIDs

**File:** `packages/prisma/seed.ts`

```typescript
import { randomUUID } from 'crypto';

// Add these constants at the top
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const ADMIN_USER_ID = '550e8400-e29b-41d4-a716-446655440002';

// Update user creation
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

```bash
ADMIN_USER_IDS=550e8400-e29b-41d4-a716-446655440002
```

### 3. Fix endImpersonationAction (CRITICAL)

**File:** `apps/frontend/apps/web/app/admin/accounts/_lib/server/admin-actions.ts`

Add import:
```typescript
import { getSessionUser, auth } from '@kit/shared/auth';
```

Update the function:
```typescript
export async function endImpersonationAction() {
  // ✅ Use auth() to get the REAL admin ID from JWT
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

  // Now this will work because adminId is the actual admin's ID
  await endImpersonation(sessionToken, adminId);

  cookieStore.delete(IMPERSONATION_COOKIE_NAME);
  redirect('/admin/accounts');
}
```

### 4. Remove Duplicate Banner

**File:** `apps/frontend/apps/web/app/layout.tsx`

Remove these lines:
```typescript
// DELETE THIS LINE
import { ImpersonationBannerWrapper } from '~/components/admin/impersonation-banner-wrapper';

// In the body, DELETE THIS LINE
<ImpersonationBannerWrapper />
```

### 5. Add Banner to User Layout

**File:** `apps/frontend/apps/web/app/home/(user)/layout.tsx`

Add imports:
```typescript
import { getImpersonationInfo } from '@kit/shared/auth';
import { ImpersonationBanner } from '../../admin/_components/impersonation-banner';
import { endImpersonationAction } from '~/admin/accounts/_lib/server/admin-actions';
```

Update both layout functions to add the banner INSIDE the Page component:

```typescript
function SidebarLayout({ children }: React.PropsWithChildren) {
  const workspace = use(loadUserWorkspace());
  const state = use(getLayoutState());
  const impersonation = use(getImpersonationInfo());

  return (
    <UserWorkspaceContextProvider value={workspace}>
      <SidebarProvider defaultOpen={state.open}>
        <Page style={'sidebar'}>
          <PageNavigation>
            <HomeSidebar workspace={workspace} />
          </PageNavigation>

          <PageMobileNavigation className={'flex items-center justify-between'}>
            <MobileNavigation />
          </PageMobileNavigation>

          <div className="flex flex-1 flex-col">
            {impersonation && (
              <div className="w-full px-4 pt-4 pb-2">
                <ImpersonationBanner
                  adminEmail={impersonation.admin.email}
                  targetEmail={impersonation.targetUser.email}
                  onStop={endImpersonationAction}
                />
              </div>
            )}
            {children}
          </div>
        </Page>

        <HomeMobileBottomNav workspace={workspace} />
      </SidebarProvider>
    </UserWorkspaceContextProvider>
  );
}

function HeaderLayout({ children }: React.PropsWithChildren) {
  const workspace = use(loadUserWorkspace());
  const impersonation = use(getImpersonationInfo());

  return (
    <UserWorkspaceContextProvider value={workspace}>
      <Page style={'header'}>
        <PageNavigation>
          <HomeMenuNavigation workspace={workspace} />
        </PageNavigation>

        <PageMobileNavigation className={'flex items-center justify-between'}>
          <MobileNavigation />
        </PageMobileNavigation>

        <div className="flex flex-1 flex-col">
          {impersonation && (
            <div className="w-full px-4 pt-4 pb-2">
              <ImpersonationBanner
                adminEmail={impersonation.admin.email}
                targetEmail={impersonation.targetUser.email}
                onStop={endImpersonationAction}
              />
            </div>
          )}
          {children}
        </div>
      </Page>

      <HomeMobileBottomNav workspace={workspace} />
    </UserWorkspaceContextProvider>
  );
}
```

**CRITICAL**: The banner must be INSIDE the `<Page>` component, wrapped with children in a flex container. If placed outside, it will break the page layout and hide all content.

### 6. Create getImpersonationInfo Helper

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

  // ✅ Use auth() to get real admin ID
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

### 7. Export Helper

**File:** `apps/frontend/packages/shared/src/auth/index.ts`

```typescript
export * from './types';
export * from './nextauth';
export * from './session';
export * from './impersonation';  // ADD THIS
export * from './ensure-user';
export * from './token-storage';
```

### 8. Create New Banner Component

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
      <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
      <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
        <span className="text-sm break-words">
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
          className="flex-shrink-0"
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

**Important styling notes:**
- `flex-col sm:flex-row` - Stacks vertically on mobile, horizontal on desktop
- `break-words` - Allows long email addresses to wrap
- `flex-shrink-0` on button - Prevents button from shrinking

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

### Step 3: Restart the dev server and clear cache

```bash
# Kill the dev server
pkill -f "next dev"

# Delete Next.js cache
rm -rf apps/frontend/apps/web/.next

# Restart
./dev.sh
```

### Step 4: Clear browser session

- Log out completely or delete browser cookies (clear site data)
- Hard refresh (Cmd+Shift+R on Mac or Ctrl+Shift+R on Windows)
- Log back in with admin@example.com / Thereis1

---

## Why This Works

1. **UUID Fix**: Seed data now uses valid UUIDs that pass validation
2. **Auth Fix**: Using `auth()` gets the JWT's admin ID, not the impersonated user's ID
3. **Single Banner**: Only one banner system, properly positioned
4. **Session Override**: `getSessionUser()` checks for impersonation and returns target user data
5. **Audit Trail**: All impersonation logged in `ImpersonationSession` table

## Testing

1. Log in as admin@example.com
2. Go to `/admin/accounts`
3. Click "Impersonate" on a user
4. Verify:
   - Yellow banner shows at top
   - User's data displayed
   - Banner shows both admin and target emails
5. Click "Return to Admin"
6. Verify back on admin page

## Key Technical Insight

**The difference between `auth()` and `getSessionUser()`:**

- `auth()` - Returns data from the JWT session token (always the actual logged-in user)
- `getSessionUser()` - Returns data from the database (can be overridden during impersonation)

**During impersonation:**
- `auth()` → Returns admin's data ✅
- `getSessionUser()` → Returns target user's data ✅

This is why we use:
- `auth()` for authentication checks and getting admin ID
- `getSessionUser()` for displaying user-specific data

---

## Common Issues & Solutions

### Issue: Banner hides all page content

**Cause**: Banner placed outside `<Page>` component breaks the layout structure.

**Fix**: Ensure banner is INSIDE `<Page>` and wrapped with children:
```typescript
<Page style={'sidebar'}>
  {/* navigation components */}
  <div className="flex flex-1 flex-col">
    {impersonation && <ImpersonationBanner {...} />}
    {children}
  </div>
</Page>
```

### Issue: Banner text is cut off

**Cause**: Flexbox not allowing text to wrap.

**Fix**: Use responsive flex direction and allow wrapping:
```typescript
<AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
  <span className="text-sm break-words">
    {/* text */}
  </span>
  {/* button */}
</AlertDescription>
```

### Issue: Old banner still showing after cache clear

**Cause**: Old banner files still exist in `components/admin/`.

**Fix**: 
```bash
rm apps/frontend/apps/web/components/admin/impersonation-banner.tsx
rm apps/frontend/apps/web/components/admin/impersonation-banner-wrapper.tsx
rm -rf apps/frontend/apps/web/.next
# Restart dev server
```

### Issue: "This session does not belong to you"

**Cause**: Using `getSessionUser()` instead of `auth()` to get admin ID.

**Fix**: Always use `auth()` in `endImpersonationAction`:
```typescript
const session = await auth();
const adminId = session?.user?.id;
```
