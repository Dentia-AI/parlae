# Admin and Super Admin Impersonation System - Implementation Summary

**Date**: January 23, 2026  
**Status**: Backend Complete, Frontend Partial  

## Overview

A comprehensive admin and super admin impersonation system has been implemented to allow administrators to view the application exactly as users would see it, with proper access control and automatic session tracking.

## Features Implemented

### 1. Database Schema ✅

**New Models**:
- `AdminAccess` - Tracks which admins have been granted access to which accounts
- `ImpersonationSession` - Tracks active and historical impersonation sessions

**User Role Extensions**:
- Added `ADMIN` role
- Added `SUPER_ADMIN` role

**Migration**: `/dentia/packages/prisma/migrations/20260123000000_add_admin_impersonation/migration.sql`

### 2. Backend API ✅

**Location**: `/dentia/apps/backend/src/admin/`

**Controllers**:
- `AdminController` - Handles all admin-related endpoints

**Services**:
- `AdminService` - Account searching, admin access management
- `ImpersonationService` - Session management, impersonation logic

**Guards**:
- `AdminGuard` - Verifies user has ADMIN or SUPER_ADMIN role
- `ImpersonationGuard` - Swaps user context during impersonation

**DTOs**:
- `AccountListDto` - Account listing and search
- `ImpersonationDto` - Impersonation session management  
- `AdminAccessDto` - Admin access permissions

**API Endpoints**:

```
GET /admin/accounts
  - Search all accounts in the system
  - Query params: search, page, limit, sortBy, sortOrder
  - Access: ADMIN, SUPER_ADMIN

POST /admin/impersonate/start
  - Start impersonating a user
  - Body: { targetUserId, accountId? }
  - Access: ADMIN (with permission), SUPER_ADMIN (always)

POST /admin/impersonate/end
  - End current impersonation session
  - Body: { sessionToken }
  - Access: ADMIN, SUPER_ADMIN

GET /admin/impersonate/status
  - Get current impersonation status
  - Access: ADMIN, SUPER_ADMIN

POST /admin/access/grant
  - Grant admin access to a user
  - Body: { adminId, accountId?, expiresAt?, notes? }
  - Access: Account owners, SUPER_ADMIN

DELETE /admin/access/revoke
  - Revoke admin access
  - Body: { adminId, accountId? }
  - Access: Granter, SUPER_ADMIN

GET /admin/access/list
  - List access for current user
  - Access: Authenticated users

GET /admin/access/granted
  - List access granted by current user
  - Access: Authenticated users
```

### 3. Frontend API Client ✅

**Location**: `/dentia/apps/frontend/apps/web/lib/server/admin-api.ts`

**Functions**:
- `searchAccounts()` - Search accounts with pagination
- `startImpersonation()` - Start impersonation session
- `endImpersonation()` - End impersonation session
- `getImpersonationStatus()` - Get current status
- `grantAdminAccess()` - Grant admin access
- `revokeAdminAccess()` - Revoke admin access
- `listAdminAccess()` - List access for current user
- `listGrantedAccess()` - List granted access

## Features To Be Implemented

### 4. Frontend UI Components ⏳

**Pages Needed**:

1. **Admin Accounts List Page** (`/app/admin/accounts/page.tsx`)
   - Search bar with real-time filtering
   - Paginated table of all accounts
   - "Impersonate" button for each account
   - Display primary owner information
   - Display member count

2. **Impersonation Banner Component** (`/components/admin/impersonation-banner.tsx`)
   - Sticky banner shown when impersonating
   - Display current user being impersonated
   - "Return to Admin" button
   - Auto-appears on all pages during impersonation

3. **User Settings - Admin Access Page** (`/app/home/(user)/settings/admin-access/page.tsx`)
   - List of admins with access
   - "Grant Access" button
   - "Revoke Access" button for each admin
   - Display grant date and granter

4. **Grant Admin Access Dialog** (`/components/admin/grant-admin-access-dialog.tsx`)
   - Search for admin users
   - Optional account selection
   - Optional expiration date
   - Notes field

**Server Actions Needed**:

```typescript
// /app/admin/_lib/server/admin-actions.ts
export async function startImpersonationAction(targetUserId: string, accountId?: string)
export async function endImpersonationAction(sessionToken: string)

// /app/home/(user)/settings/admin-access/_lib/server/admin-access-actions.ts
export async function grantAdminAccessAction(data: GrantAdminAccessDto)
export async function revokeAdminAccessAction(data: RevokeAdminAccessDto)
```

## Usage Flow

### Super Admin Flow

1. **Super Admin** navigates to `/admin/accounts`
2. Searches for an account using the search bar
3. Clicks "Impersonate" button next to target account
4. Session is created and stored in database
5. **Super Admin** sees banner: "Impersonating: [User Email]"
6. All subsequent requests use impersonation context
7. **Super Admin** experiences the app exactly as the user would
8. Clicks "Return to Admin" button
9. Session is ended, returns to admin accounts list

### Admin (Non-Super) Flow

1. **User** grants access to an **Admin** via settings
2. **Admin** navigates to `/admin/accounts`
3. Searches for the user who granted them access
4. Clicks "Impersonate" button
5. Session is created with `autoRevokeAccess = true`
6. **Admin** sees banner: "Impersonating: [User Email]"
7. Experiences the app as the user would
8. Clicks "Return to Admin" button
9. Session ends AND access is automatically revoked
10. **Admin** cannot impersonate that user again without new permission

### User Granting Access Flow

1. **User** navigates to `/home/settings/admin-access`
2. Clicks "Grant Admin Access"
3. Searches for an admin user
4. Optionally selects specific account
5. Optionally sets expiration date
6. Adds notes (optional)
7. Clicks "Grant Access"
8. Admin now appears in user's granted access list
9. User can revoke access at any time

### User Revoking Access Flow

1. **User** navigates to `/home/settings/admin-access`
2. Sees list of admins with access
3. Clicks "Revoke Access" next to an admin
4. Access is immediately revoked
5. Any active impersonation sessions for that admin are ended
6. Admin can no longer impersonate the user

## Database Schema Details

### AdminAccess Table

```prisma
model AdminAccess {
  id               String    @id @default(uuid())
  adminId          String    // Admin user who received access
  grantedByUserId  String    // User who granted the access
  accountId        String?   // Optional: specific account
  grantedAt        DateTime  @default(now())
  revokedAt        DateTime?
  isRevoked        Boolean   @default(false)
  expiresAt        DateTime?
  notes            String?
  
  // Relations
  admin        User     @relation("AdminAccessReceivedByAdmin")
  grantedBy    User     @relation("AdminAccessGrantedByUser")
  account      Account? @relation
}
```

### ImpersonationSession Table

```prisma
model ImpersonationSession {
  id              String    @id @default(uuid())
  adminId         String    // Admin performing impersonation
  targetUserId    String    // User being impersonated
  accountId       String?   // Optional: specific account context
  startedAt       DateTime  @default(now())
  endedAt         DateTime?
  isActive        Boolean   @default(true)
  ipAddress       String?
  userAgent       String?
  sessionToken    String    @unique // Token passed in headers
  autoRevokeAccess Boolean  @default(false) // For non-super admins
  
  // Relations
  admin      User     @relation("ImpersonationAdmin")
  targetUser User     @relation("ImpersonationTarget")
  account    Account?
}
```

## Security Considerations

### Access Control

1. **Super Admin**:
   - Can impersonate anyone except other super admins
   - Access never expires or gets revoked
   - Sessions can last up to 24 hours

2. **Admin**:
   - Can only impersonate users who explicitly granted them access
   - Access is automatically revoked when impersonation ends
   - Must request new permission for each impersonation
   - Sessions auto-expire after 24 hours

3. **Regular Users**:
   - Can grant/revoke admin access to their accounts
   - Can see all admins who have access
   - Revoking access immediately ends active sessions

### Session Security

1. Sessions use cryptographically secure random tokens (64 hex characters)
2. Tokens are validated on every request via `ImpersonationGuard`
3. Sessions auto-expire after 24 hours
4. IP address and User-Agent tracked for audit purposes
5. All session activity logged to database

### Authorization Checks

1. Backend enforces role checks via `AdminGuard`
2. Frontend hides UI elements based on role
3. Database RLS policies ensure data isolation
4. All impersonation requests validated against `AdminAccess` table

## Testing Checklist

### Backend Tests ✅

- [x] AdminGuard correctly identifies ADMIN and SUPER_ADMIN
- [x] ImpersonationGuard swaps user context correctly
- [x] Super admin can start impersonation without permission
- [x] Regular admin requires permission to impersonate
- [x] Sessions are created with correct attributes
- [x] Auto-revoke works for regular admins
- [x] Sessions auto-expire after 24 hours
- [x] Account search works with pagination
- [x] Access grant/revoke works correctly

### Frontend Tests (To Do) ⏳

- [ ] Admin can search accounts
- [ ] Impersonation banner appears when impersonating
- [ ] Banner shows correct user information
- [ ] "Return to Admin" button ends impersonation
- [ ] User can grant admin access
- [ ] User can revoke admin access
- [ ] Revoked access immediately ends sessions
- [ ] Admin cannot impersonate after revocation
- [ ] Super admin can always impersonate
- [ ] Expired access is not usable

## Implementation Steps Remaining

### Step 1: Create Admin Accounts Page

File: `/dentia/apps/frontend/apps/web/app/admin/accounts/page.tsx`

Features:
- Server component that calls `searchAccounts()`
- Search input with debounce
- Paginated table with account details
- "Impersonate" button (calls server action)
- Loading and error states

### Step 2: Create Impersonation Server Actions

File: `/dentia/apps/frontend/apps/web/app/admin/_lib/server/admin-actions.ts`

Functions:
- `startImpersonationAction()` - Calls API, stores token in cookie
- `endImpersonationAction()` - Calls API, clears cookie
- Uses `'use server'` directive
- Proper error handling

### Step 3: Create Impersonation Banner

File: `/dentia/apps/frontend/apps/web/components/admin/impersonation-banner.tsx`

Features:
- Client component
- Reads impersonation status from API or cookie
- Shows sticky banner at top of page
- "Return to Admin" button
- Auto-dismisses when session ends

### Step 4: Add Banner to Root Layout

File: `/dentia/apps/frontend/apps/web/app/layout.tsx`

Changes:
- Import and render `<ImpersonationBanner />`
- Position it above main content
- Only shows when impersonating

### Step 5: Create User Settings Page

File: `/dentia/apps/frontend/apps/web/app/home/(user)/settings/admin-access/page.tsx`

Features:
- List of admins with access
- "Grant Access" button (opens dialog)
- "Revoke Access" button for each admin
- Shows grant date, expiration, notes

### Step 6: Create Grant Access Dialog

File: `/dentia/apps/frontend/apps/web/components/admin/grant-admin-access-dialog.tsx`

Features:
- Search for admin users (call backend API)
- Account selector (optional)
- Date picker for expiration (optional)
- Notes textarea
- Form validation with Zod
- Calls server action on submit

### Step 7: Update Navigation

Files:
- `/dentia/apps/frontend/apps/web/config/personal-account-navigation.config.tsx`
- `/dentia/apps/frontend/apps/web/app/admin/_components/admin-sidebar.tsx`

Changes:
- Add "Admin Access" link to user settings
- Add "Accounts" link to admin sidebar

### Step 8: Add Impersonation Header

File: `/dentia/apps/frontend/apps/web/middleware.ts` or backend header injection

Feature:
- When impersonating, add `X-Impersonation-Token` header to all backend requests
- Backend `ImpersonationGuard` will pick this up and swap user context

## Migration Instructions

### Running the Migration

```bash
# From project root
cd dentia/packages/prisma

# Generate Prisma client with new models
pnpm prisma generate

# Run the migration
pnpm prisma migrate deploy

# Or in development
pnpm prisma migrate dev
```

### Creating Admin Users

```sql
-- Make a user a super admin
UPDATE users SET role = 'super_admin' WHERE email = 'admin@example.com';

-- Make a user a regular admin
UPDATE users SET role = 'admin' WHERE email = 'support@example.com';
```

### Granting Initial Access (for testing)

```sql
-- Grant an admin access to a user's account
INSERT INTO admin_access (admin_id, granted_by_user_id, account_id)
VALUES (
  'admin-user-id',
  'target-user-id',
  'account-id' -- or NULL for all accounts
);
```

## Environment Variables

No new environment variables required. Uses existing:
- `DATABASE_URL` - Prisma database connection
- `BACKEND_API_URL` - Backend API endpoint (already configured)

## Error Handling

### Common Errors

1. **"Admin access required"**
   - User doesn't have ADMIN or SUPER_ADMIN role
   - Solution: Update user role in database

2. **"Admin does not have access to impersonate this user"**
   - Regular admin trying to impersonate without permission
   - Solution: User must grant access first

3. **"Invalid or expired impersonation session"**
   - Session token invalid or expired
   - Solution: Start new impersonation session

4. **"Cannot impersonate super admin"**
   - Trying to impersonate another super admin
   - Solution: This is not allowed for security

## Logging and Auditing

All impersonation activities are logged:
- Session start: Admin ID, target user, IP, user agent
- Session end: Duration, admin ID
- Access grants: Grantor, admin, account, expiration
- Access revocations: Reason, revoker

Query session history:

```sql
SELECT 
  s.*,
  a.email as admin_email,
  t.email as target_email
FROM impersonation_sessions s
JOIN users a ON s.admin_id = a.id
JOIN users t ON s.target_user_id = t.id
WHERE s.ended_at IS NOT NULL
ORDER BY s.started_at DESC;
```

## Performance Considerations

1. **Indexes**: All foreign keys are indexed for fast lookups
2. **Token lookup**: Session token has unique index for O(1) lookups
3. **Pagination**: Account search is paginated (default 20 per page)
4. **Caching**: Consider caching admin access checks if needed

## Future Enhancements

Potential improvements:
1. **Audit Log UI**: Admin page to view all impersonation history
2. **Notifications**: Notify users when admin starts/ends impersonation
3. **Time Limits**: Configurable session durations per admin
4. **Approval Workflow**: Require user approval before each impersonation
5. **MFA Requirement**: Require MFA for super admin actions
6. **IP Whitelisting**: Restrict impersonation to specific IPs

## Support

For issues or questions:
- Backend code: `/dentia/apps/backend/src/admin/`
- Frontend code: `/dentia/apps/frontend/apps/web/`
- Database schema: `/dentia/packages/prisma/schema.prisma`
- Migration: `/dentia/packages/prisma/migrations/20260123000000_add_admin_impersonation/`

---

**Next Steps**: Complete frontend implementation following steps 1-8 above.

