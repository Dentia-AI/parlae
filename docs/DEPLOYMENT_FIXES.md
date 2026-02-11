# Deployment Fixes Summary

This document outlines the fixes applied to resolve backend and frontend deployment issues.

## Issues Identified

### 1. Backend Deployment - ECS Cluster Not Found
**Error**: `ClusterNotFoundException: Cluster not found`

**Root Cause**: GitHub Secrets were not properly configured with the correct AWS region (`us-east-2`)

**Solution**: 
- Updated GitHub workflow with better error handling
- Added repository verification step
- Documented required GitHub Secrets

**Required GitHub Secrets** (at `https://github.com/Dentia-AI/parlae/settings/secrets/actions`):
- `AWS_REGION` = `us-east-2`
- `ECR_REPOSITORY` = `234270344223.dkr.ecr.us-east-2.amazonaws.com`
- `AWS_ACCESS_KEY_ID` = Your AWS access key
- `AWS_SECRET_ACCESS_KEY` = Your AWS secret key

See [GITHUB_ACTIONS_AWS_SETUP.md](./GITHUB_ACTIONS_AWS_SETUP.md) for complete setup instructions.

### 2. Frontend Deployment - Next.js Build Error
**Error**: 
```
Client Component Browser:
  ./apps/frontend/packages/shared/src/auth/session.ts [Client Component Browser]
  ...
Exit status 1
```

**Root Cause**: The `session.ts` file uses server-only APIs (`cookies()` from `next/headers`) but was being imported in client components through a chain:
- Client Component → Server Loader → `session.ts`

Next.js detected this import chain and attempted to bundle server-only code for the client, causing the build to fail.

## Fixes Applied

### Fix 1: Mark session.ts as server-only

**File**: `apps/frontend/packages/shared/src/auth/session.ts`

```typescript
import 'server-only';  // Added this import

import { cache } from 'react';
import { cookies } from 'next/headers';
// ... rest of the file
```

### Fix 2: Create Server Actions for Client Components

**New File**: `apps/frontend/apps/web/app/home/[account]/settings/admin-access/_lib/server/server-actions.ts`

Moved the `searchAdminUsers` function from the loader to a proper server action that can be safely called from client components.

```typescript
'use server';

export async function searchAdminUsersAction(search: string) {
  // Implementation moved from loader
}
```

### Fix 3: Mark Loaders as server-only

**File**: `apps/frontend/apps/web/app/home/[account]/settings/admin-access/_lib/server/admin-access-loader.ts`

```typescript
import 'server-only';  // Added this import

// ... rest of the file
```

### Fix 4: Update Client Components

**File**: `apps/frontend/apps/web/app/home/[account]/settings/admin-access/_components/admin-access-manager.tsx`

Changed from:
```typescript
import { searchAdminUsers } from '../_lib/server/admin-access-loader';
// ...
queryFn: () => searchAdminUsers(searchQuery),
```

To:
```typescript
import { searchAdminUsersAction } from '../_lib/server/server-actions';
// ...
queryFn: () => searchAdminUsersAction(searchQuery),
```

## Architecture Pattern

### Correct Pattern for Data Loading

```
┌─────────────────────────────────┐
│   Page.tsx (Server Component)   │
│   - Loads data server-side      │
│   - Passes data as props         │
└────────────┬────────────────────┘
             │
             │ Props (data)
             ▼
┌─────────────────────────────────┐
│  Component.tsx (Client)          │
│  - Receives data                 │
│  - Uses server actions for       │
│    additional data fetching      │
└─────────────────────────────────┘
```

### What NOT to Do

❌ **Don't import server-only utilities in client components**:
```typescript
// client-component.tsx
'use client';

import { getSessionUser } from '@kit/shared/auth';  // ❌ WRONG!
```

✅ **Do use server actions from client components**:
```typescript
// client-component.tsx
'use client';

import { myServerAction } from '../_lib/server/server-actions';  // ✅ CORRECT!
```

## Files Modified

1. ✅ `.github/workflows/deploy-backend.yml` - Enhanced with better error handling
2. ✅ `apps/frontend/packages/shared/src/auth/session.ts` - Added 'server-only'
3. ✅ `apps/frontend/apps/web/app/home/[account]/settings/admin-access/_lib/server/admin-access-loader.ts` - Added 'server-only', removed function
4. ✅ `apps/frontend/apps/web/app/home/[account]/settings/admin-access/_lib/server/server-actions.ts` - Created new file
5. ✅ `apps/frontend/apps/web/app/home/[account]/settings/admin-access/_components/admin-access-manager.tsx` - Updated imports

## Files Created

1. 📄 `docs/GITHUB_ACTIONS_AWS_SETUP.md` - Complete AWS/GitHub Actions setup guide
2. 📄 `docs/DEPLOYMENT_FIXES.md` - This file
3. 📄 `apps/frontend/apps/web/app/home/[account]/settings/admin-access/_lib/server/server-actions.ts` - Server actions for client components

## Testing the Fixes

### Backend Deployment

1. Verify GitHub Secrets are set correctly
2. Trigger the workflow manually or push to main
3. Check the workflow logs for successful ECR login and push

### Frontend Deployment

1. Run local build:
   ```bash
   cd apps/frontend/apps/web
   pnpm build
   ```

2. Verify no Next.js errors about server-only code in client components

3. Test the admin access feature:
   - Navigate to `/home/[account]/settings/admin-access`
   - Try searching for admin users
   - Verify the search works correctly

## Best Practices Going Forward

1. **Always mark server-only files** with `import 'server-only'`
2. **Create server actions** for any functions that need to be called from client components
3. **Keep data loading in server components** and pass data down as props
4. **Use the correct AWS region** (`us-east-2`) for all deployment configurations
5. **Test builds locally** before pushing to avoid deployment failures

## CI/CD Pipeline

The deployment workflows have been updated to automatically trigger **after tests pass**:

### Before (Manual/Risky)
```
Push to main → Deploy immediately (might deploy broken code)
```

### After (Safe/Automatic)
```
Push to main → Tests run → Tests pass ✅ → Deploy automatically
                         → Tests fail ❌ → No deployment
```

See [CI_CD_PIPELINE.md](./CI_CD_PIPELINE.md) for complete details.

## Related Documentation

- [CI_CD_PIPELINE.md](./CI_CD_PIPELINE.md) - Complete CI/CD pipeline explanation
- [GITHUB_ACTIONS_AWS_SETUP.md](./GITHUB_ACTIONS_AWS_SETUP.md) - Complete AWS setup guide
- [Next.js Server/Client Components](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns)
- [Next.js Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
