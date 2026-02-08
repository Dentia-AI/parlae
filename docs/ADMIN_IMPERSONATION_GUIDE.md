# Admin Impersonation Feature Guide

## Overview

The admin impersonation feature allows administrators to view the application from a user's perspective. This is useful for troubleshooting issues, providing customer support, and understanding the user experience.

## Architecture

The admin impersonation system is implemented **entirely in the Next.js frontend** using:
- **Server Actions** for admin operations
- **Server Components** for data fetching
- **Prisma** for direct database access
- **Cookies** for session management

**Note:** This feature does NOT use the core NestJS backend. All admin functionality is self-contained in the frontend's backend (API routes and server actions).

## User Roles

### Super Admin (`SUPER_ADMIN`)
- Can impersonate any user (except other super admins)
- Does not need explicit permission from users
- Access never expires
- Cannot be revoked by users

### Admin (`ADMIN`)
- Can only impersonate users who have granted them access
- Access is automatically revoked after impersonation session ends
- Access can be manually revoked by the user at any time
- Cannot impersonate super admins

### Regular Users
- Can grant/revoke admin access to their accounts
- Can see who has access to their account
- Automatically revokes admin access after session ends

## Database Schema

### User Role Enum
```prisma
enum UserRole {
  ACCOUNT_MANAGER @map("account_manager")
  EMPLOYEE        @map("employee")
  ADMIN           @map("admin")
  SUPER_ADMIN     @map("super_admin")
}
```

### AdminAccess Model
Tracks which admins have permission to impersonate which users.

```prisma
model AdminAccess {
  id               String    @id @default(uuid())
  adminId          String    @map("admin_id")
  grantedByUserId  String    @map("granted_by_user_id")
  accountId        String?   @map("account_id")
  grantedAt        DateTime  @default(now())
  revokedAt        DateTime?
  isRevoked        Boolean   @default(false)
  expiresAt        DateTime?
  notes            String?

  admin        User     @relation("AdminAccessReceivedByAdmin")
  grantedBy    User     @relation("AdminAccessGrantedByUser")
  account      Account?
}
```

### ImpersonationSession Model
Tracks active and historical impersonation sessions.

```prisma
model ImpersonationSession {
  id              String    @id @default(uuid())
  adminId         String
  targetUserId    String
  accountId       String?
  startedAt       DateTime  @default(now())
  endedAt         DateTime?
  isActive        Boolean   @default(true)
  ipAddress       String?
  userAgent       String?
  sessionToken    String    @unique
  autoRevokeAccess Boolean  @default(false)

  admin      User
  targetUser User
  account    Account?
}
```

## File Structure

```
dentia/apps/frontend/apps/web/
├── lib/auth/
│   └── is-admin.ts                    # High-level admin check functions
├── app/admin/
│   └── accounts/
│       ├── page.tsx                   # Admin accounts list page
│       ├── _components/
│       │   └── accounts-list-container.tsx  # Search & list UI
│       └── _lib/server/
│           ├── accounts-loader.ts     # Account search & fetch
│           ├── impersonation-service.ts  # Session management
│           └── admin-actions.ts       # Server actions
├── app/home/[account]/settings/
│   └── admin-access/
│       ├── page.tsx                   # User settings page
│       ├── _components/
│       │   └── admin-access-manager.tsx  # Grant/revoke UI
│       └── _lib/server/
│           └── admin-access-loader.ts  # Access data fetching
└── components/admin/
    ├── impersonation-banner.tsx       # Client component
    └── impersonation-banner-wrapper.tsx  # Server wrapper
```

## Key Functions

### `is-admin.ts`
High-level functions for checking admin permissions:

- `isAdmin()` - Check if current user is admin or super admin
- `isSuperAdmin()` - Check if current user is super admin
- `canImpersonateUser(adminId, targetUserId, accountId?)` - Check impersonation permission
- `requireAdmin()` - Throw error if not admin
- `requireSuperAdmin()` - Throw error if not super admin
- `getAdminRole()` - Get current user's admin role

### Server Actions (`admin-actions.ts`)

- `startImpersonationAction(targetUserId, accountId?)` - Start impersonating a user
- `endImpersonationAction()` - End current impersonation session
- `grantAdminAccessAction({ adminId, accountId?, expiresAt?, notes? })` - Grant admin access
- `revokeAdminAccessAction({ adminId, accountId? })` - Revoke admin access

### Impersonation Service (`impersonation-service.ts`)

- `startImpersonation(adminId, targetUserId, accountId, autoRevokeAccess)` - Create session
- `endImpersonation(sessionToken, adminId)` - End session
- `getImpersonationStatus(adminId)` - Get current session status
- `getImpersonationStatusByToken(sessionToken)` - Get session by token

## User Flows

### Super Admin Flow

1. Navigate to `/admin/accounts`
2. Search for any user account
3. Click "Impersonate" button
4. Redirected to `/home` as that user
5. Yellow banner appears at top showing impersonation status
6. Click "Return to Admin" to end session
7. Redirected back to `/admin/accounts`

### Admin Flow (with user permission)

1. User navigates to `/home/[account]/settings/admin-access`
2. User clicks "Grant Access" and selects an admin
3. Admin navigates to `/admin/accounts`
4. Admin searches for the user who granted access
5. Admin clicks "Impersonate" button
6. Redirected to `/home` as that user
7. Yellow banner appears at top
8. Click "Return to Admin" to end session
9. **Admin access is automatically revoked**
10. Admin cannot impersonate that user again without new permission

### User Managing Admin Access

1. Navigate to `/home/[account]/settings/admin-access`
2. View list of active admin accesses
3. Click "Grant Access" to add new admin
   - Search for admin by email/name
   - Optionally add notes
   - Click "Grant Access"
4. Click "Revoke" to remove admin access
   - Any active impersonation sessions are immediately ended
   - Admin cannot impersonate again

## Security Features

### Permission Checks
- All admin actions verify user role before execution
- Super admins cannot impersonate other super admins
- Regular admins need explicit user permission
- Permissions checked on both client and server

### Session Management
- Sessions stored in HTTP-only cookies
- Sessions expire after 24 hours
- Only one active impersonation session per admin
- Session tokens are cryptographically secure (32-byte random hex)

### Audit Trail
- All impersonation sessions logged with:
  - Start/end timestamps
  - IP address (optional)
  - User agent (optional)
  - Target user and account
- Admin access grants/revokes tracked with timestamps

### Automatic Revocation
- Admin access automatically revoked when admin ends session
- Super admin access never auto-revokes
- Expired sessions (>24h) automatically marked inactive

## UI Components

### Impersonation Banner
- Sticky banner at top of page during impersonation
- Shows target user name and email
- "Return to Admin" button to end session
- Yellow background for high visibility
- Only visible during active impersonation

### Admin Accounts List
- Search by account name, email, or owner
- Pagination support (20 accounts per page)
- Shows account details:
  - Account name and avatar
  - Primary owner info
  - Member count
  - Account type (Personal/Team)
  - Creation date
- "Impersonate" button for each account

### Admin Access Manager
- Warning card explaining implications
- Active access list with revoke buttons
- Grant access dialog with admin search
- Revoked access history
- Notes field for documenting access reasons

## Testing Checklist

### Super Admin Tests
- [ ] Can view `/admin/accounts` page
- [ ] Can search for accounts
- [ ] Can impersonate any regular user
- [ ] Cannot impersonate another super admin
- [ ] Banner appears during impersonation
- [ ] Can end impersonation session
- [ ] Access not revoked after session ends
- [ ] Can impersonate same user multiple times

### Admin Tests (without permission)
- [ ] Can view `/admin/accounts` page
- [ ] Can search for accounts
- [ ] Cannot impersonate users without permission
- [ ] Error message shown when attempting impersonation

### Admin Tests (with permission)
- [ ] Can impersonate user who granted access
- [ ] Banner appears during impersonation
- [ ] Can end impersonation session
- [ ] Access automatically revoked after session ends
- [ ] Cannot impersonate same user again without new permission

### User Tests
- [ ] Can view admin access settings page
- [ ] Can search for admins to grant access
- [ ] Can grant access to admin
- [ ] Can revoke admin access
- [ ] Revoking access ends active sessions
- [ ] Can see active and revoked access lists

### Security Tests
- [ ] Non-admin users cannot access `/admin/accounts`
- [ ] Regular users cannot grant themselves admin role
- [ ] Impersonation cookie is HTTP-only
- [ ] Sessions expire after 24 hours
- [ ] Cannot have multiple active sessions
- [ ] Session tokens are unique and secure

## Configuration

### Environment Variables
No additional environment variables required. The feature uses the existing:
- `DATABASE_URL` - Prisma database connection
- `NEXTAUTH_URL` - For authentication context

### Database Migration
Run the migration to create the required tables:

```bash
cd dentia/packages/prisma
pnpm prisma migrate deploy
```

Migration file: `20260123000000_add_admin_impersonation/migration.sql`

## Troubleshooting

### Issue: Admin cannot see accounts list
**Solution:** Verify user has `ADMIN` or `SUPER_ADMIN` role in database:
```sql
SELECT id, email, role FROM users WHERE email = 'admin@example.com';
```

### Issue: Impersonation banner not showing
**Solution:** Check if impersonation cookie exists and session is active:
```sql
SELECT * FROM impersonation_sessions 
WHERE session_token = 'YOUR_TOKEN' AND is_active = true;
```

### Issue: Admin access not auto-revoking
**Solution:** Verify `autoRevokeAccess` flag is set correctly:
```sql
SELECT auto_revoke_access FROM impersonation_sessions 
WHERE admin_id = 'ADMIN_ID' ORDER BY started_at DESC LIMIT 1;
```

### Issue: Cannot grant admin access
**Solution:** 
1. Verify target user has `ADMIN` role
2. Check if access already exists:
```sql
SELECT * FROM admin_access 
WHERE admin_id = 'ADMIN_ID' 
AND granted_by_user_id = 'USER_ID' 
AND is_revoked = false;
```

## Future Enhancements

Potential improvements for the admin impersonation system:

1. **Time-limited Access**
   - Allow users to set expiration dates when granting access
   - Auto-revoke after specified duration

2. **Notification System**
   - Notify users when admin starts impersonation
   - Email alerts for access grants/revokes

3. **Enhanced Audit Logs**
   - Track all actions performed during impersonation
   - Export audit logs for compliance

4. **Permission Scopes**
   - Allow users to grant limited access (read-only, specific features)
   - Granular permission control

5. **Admin Dashboard**
   - View all active impersonation sessions
   - Force-end sessions as super admin
   - Analytics on admin access usage

6. **Multi-Account Support**
   - Grant access to specific accounts only
   - Different permissions per account

## Support

For issues or questions about the admin impersonation feature:
1. Check this documentation
2. Review the code comments in the implementation files
3. Check the database schema and migrations
4. Test with the provided test checklist

