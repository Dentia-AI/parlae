# Admin Impersonation User Flows

## Visual Flow Diagrams

### Super Admin Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      SUPER ADMIN FLOW                           │
└─────────────────────────────────────────────────────────────────┘

1. Login as Super Admin
   │
   ├─> Navigate to /admin/accounts
   │   │
   │   ├─> Search for user (by name, email, or owner)
   │   │   │
   │   │   └─> Results displayed in table
   │   │
   │   └─> Click "Impersonate" button
   │       │
   │       ├─> Permission check (isAdmin + canImpersonateUser)
   │       │   │
   │       │   ├─> ✅ Super admin can impersonate (except other super admins)
   │       │   │
   │       │   └─> ❌ Cannot impersonate another super admin
   │       │
   │       ├─> Create ImpersonationSession
   │       │   ├─> Generate secure session token
   │       │   ├─> Store in database (isActive = true)
   │       │   └─> Set HTTP-only cookie
   │       │
   │       └─> Redirect to /home
   │
   ├─> Impersonation Active
   │   │
   │   ├─> Yellow banner appears at top
   │   │   ├─> Shows target user name/email
   │   │   └─> "Return to Admin" button
   │   │
   │   └─> User sees app as impersonated user
   │
   └─> Click "Return to Admin"
       │
       ├─> End impersonation session
       │   ├─> Update session (isActive = false, endedAt = now)
       │   └─> Clear cookie
       │
       └─> Redirect to /admin/accounts
           │
           └─> ✅ Can impersonate same user again (access not revoked)
```

### Regular Admin Flow (With Permission)

```
┌─────────────────────────────────────────────────────────────────┐
│                   REGULAR ADMIN FLOW                            │
└─────────────────────────────────────────────────────────────────┘

STEP 1: User Grants Access
   │
   ├─> User navigates to /home/[account]/settings/admin-access
   │   │
   │   ├─> Click "Grant Access" button
   │   │   │
   │   │   ├─> Search for admin by email/name
   │   │   │   │
   │   │   │   └─> Results show users with role = 'ADMIN'
   │   │   │
   │   │   ├─> Select admin from results
   │   │   │
   │   │   ├─> Optionally add notes
   │   │   │
   │   │   └─> Click "Grant Access"
   │   │       │
   │   │       └─> Create AdminAccess record
   │   │           ├─> adminId = selected admin
   │   │           ├─> grantedByUserId = current user
   │   │           ├─> accountId = current account
   │   │           ├─> isRevoked = false
   │   │           └─> grantedAt = now
   │   │
   │   └─> Admin appears in "Active Admin Access" table

STEP 2: Admin Impersonates User
   │
   ├─> Admin logs in
   │   │
   │   └─> Navigate to /admin/accounts
   │       │
   │       ├─> Search for user who granted access
   │       │   │
   │       │   └─> Results displayed
   │       │
   │       └─> Click "Impersonate" button
   │           │
   │           ├─> Permission check
   │           │   │
   │           │   ├─> Check AdminAccess table
   │           │   │   ├─> adminId = current admin
   │           │   │   ├─> grantedByUserId = target user
   │           │   │   ├─> isRevoked = false
   │           │   │   └─> expiresAt = null OR > now
   │           │   │
   │           │   ├─> ✅ Access found → Allow
   │           │   │
   │           │   └─> ❌ No access → Error message
   │           │
   │           ├─> Create ImpersonationSession
   │           │   ├─> autoRevokeAccess = true (for regular admins)
   │           │   ├─> Generate session token
   │           │   ├─> Store in database
   │           │   └─> Set HTTP-only cookie
   │           │
   │           └─> Redirect to /home
   │
   ├─> Impersonation Active
   │   │
   │   ├─> Yellow banner appears
   │   │
   │   └─> Admin sees app as user
   │
   └─> Click "Return to Admin"
       │
       ├─> End impersonation session
       │   ├─> Update session (isActive = false)
       │   │
       │   └─> Auto-revoke admin access (because autoRevokeAccess = true)
       │       └─> Update AdminAccess (isRevoked = true, revokedAt = now)
       │
       └─> Redirect to /admin/accounts
           │
           └─> ❌ Cannot impersonate same user again (access revoked)
               │
               └─> User must grant new permission
```

### User Access Management Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              USER ACCESS MANAGEMENT FLOW                        │
└─────────────────────────────────────────────────────────────────┘

Navigate to /home/[account]/settings/admin-access
│
├─> View Active Admin Access
│   │
│   ├─> Table shows:
│   │   ├─> Admin name/email/avatar
│   │   ├─> Granted date
│   │   ├─> Notes (if any)
│   │   └─> "Revoke" button
│   │
│   └─> If empty: "No active admin access granted"
│
├─> Grant New Access
│   │
│   ├─> Click "Grant Access" button
│   │   │
│   │   └─> Dialog opens
│   │       │
│   │       ├─> Search input (min 2 characters)
│   │       │   │
│   │       │   ├─> Query users with role = 'ADMIN'
│   │       │   │
│   │       │   └─> Results displayed with avatars
│   │       │
│   │       ├─> Select admin from results
│   │       │   │
│   │       │   └─> Shows in "Selected Admin" section
│   │       │
│   │       ├─> Optionally add notes
│   │       │
│   │       └─> Click "Grant Access"
│   │           │
│   │           ├─> Validation
│   │           │   ├─> Check if access already exists
│   │           │   ├─> Verify admin has ADMIN role
│   │           │   └─> Verify user owns account
│   │           │
│   │           ├─> Create AdminAccess record
│   │           │
│   │           ├─> Success message
│   │           │
│   │           └─> Refresh page (admin appears in table)
│   │
│   └─> Warning card displayed
│       └─> "Granting admin access allows the admin to impersonate 
│            your account and access all your data. Only grant 
│            access to trusted administrators. Access will be 
│            automatically revoked after the admin ends their 
│            impersonation session."
│
├─> Revoke Access
│   │
│   ├─> Click "Revoke" button next to admin
│   │   │
│   │   ├─> Update AdminAccess
│   │   │   ├─> isRevoked = true
│   │   │   └─> revokedAt = now
│   │   │
│   │   ├─> End any active impersonation sessions
│   │   │   └─> Update ImpersonationSession (isActive = false)
│   │   │
│   │   ├─> Success message
│   │   │
│   │   └─> Refresh page
│   │       ├─> Admin removed from active table
│   │       └─> Admin appears in revoked table
│   │
│   └─> Admin can no longer impersonate
│
└─> View Revoked Access (History)
    │
    └─> Table shows:
        ├─> Admin name/email/avatar
        ├─> Granted date
        ├─> Revoked date
        └─> "Revoked" badge
```

## Permission Decision Tree

```
┌─────────────────────────────────────────────────────────────────┐
│            CAN USER IMPERSONATE TARGET?                         │
└─────────────────────────────────────────────────────────────────┘

START: Admin wants to impersonate User
│
├─> Is admin authenticated?
│   ├─> ❌ NO → Redirect to login
│   └─> ✅ YES → Continue
│
├─> What is admin's role?
│   │
│   ├─> SUPER_ADMIN
│   │   │
│   │   └─> What is target user's role?
│   │       ├─> SUPER_ADMIN → ❌ DENY (cannot impersonate super admin)
│   │       └─> Other → ✅ ALLOW
│   │
│   ├─> ADMIN
│   │   │
│   │   └─> Check AdminAccess table
│   │       │
│   │       ├─> Query:
│   │       │   WHERE adminId = admin.id
│   │       │   AND grantedByUserId = target.id
│   │       │   AND isRevoked = false
│   │       │   AND (expiresAt IS NULL OR expiresAt > NOW())
│   │       │
│   │       ├─> Record found → ✅ ALLOW
│   │       │
│   │       └─> No record → ❌ DENY (no permission granted)
│   │
│   └─> Other roles → ❌ DENY (not an admin)
│
└─> Check for existing active session
    │
    ├─> Query ImpersonationSession
    │   WHERE adminId = admin.id
    │   AND isActive = true
    │
    ├─> Session found → ❌ DENY (must end current session first)
    │
    └─> No session → ✅ ALLOW (can start new session)
```

## Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│              IMPERSONATION SESSION LIFECYCLE                    │
└─────────────────────────────────────────────────────────────────┘

CREATE SESSION
│
├─> Generate secure token (32-byte random hex)
│
├─> Create ImpersonationSession record
│   ├─> id = UUID
│   ├─> adminId = current admin
│   ├─> targetUserId = user to impersonate
│   ├─> accountId = target account (optional)
│   ├─> sessionToken = generated token
│   ├─> startedAt = NOW()
│   ├─> isActive = true
│   ├─> autoRevokeAccess = (admin role === 'ADMIN')
│   ├─> ipAddress = request IP (optional)
│   └─> userAgent = request user agent (optional)
│
├─> Set HTTP-only cookie
│   ├─> name = 'impersonation-token'
│   ├─> value = sessionToken
│   ├─> httpOnly = true
│   ├─> secure = (production only)
│   ├─> sameSite = 'lax'
│   ├─> maxAge = 24 hours
│   └─> path = '/'
│
└─> Redirect to /home

ACTIVE SESSION
│
├─> Every page load
│   │
│   ├─> Read cookie 'impersonation-token'
│   │
│   ├─> Query ImpersonationSession
│   │   WHERE sessionToken = cookie value
│   │   AND isActive = true
│   │
│   ├─> Session found
│   │   │
│   │   ├─> Check age (startedAt + 24h > NOW)
│   │   │   │
│   │   │   ├─> ✅ Valid → Show banner
│   │   │   │
│   │   │   └─> ❌ Expired → Auto-expire session
│   │   │       ├─> Update (isActive = false, endedAt = NOW)
│   │   │       └─> Clear cookie
│   │   │
│   │   └─> Render ImpersonationBanner
│   │       ├─> Shows target user info
│   │       └─> "Return to Admin" button
│   │
│   └─> No session → Normal page render
│
└─> User navigates app as impersonated user

END SESSION
│
├─> User clicks "Return to Admin"
│   │
│   └─> Call endImpersonationAction()
│
├─> Verify session ownership
│   │
│   ├─> Query session by token
│   │
│   ├─> Verify adminId matches current user
│   │
│   └─> ❌ Mismatch → Error
│
├─> Update ImpersonationSession
│   ├─> isActive = false
│   └─> endedAt = NOW()
│
├─> Check autoRevokeAccess flag
│   │
│   ├─> true (regular admin)
│   │   │
│   │   └─> Update AdminAccess
│   │       ├─> isRevoked = true
│   │       └─> revokedAt = NOW()
│   │
│   └─> false (super admin)
│       └─> No action (access remains)
│
├─> Clear cookie
│
└─> Redirect to /admin/accounts

AUTO-EXPIRATION (Background Process)
│
└─> On any session check
    │
    ├─> Calculate age: NOW() - startedAt
    │
    ├─> Age > 24 hours?
    │   │
    │   ├─> ✅ YES
    │   │   │
    │   │   ├─> Update session
    │   │   │   ├─> isActive = false
    │   │   │   └─> endedAt = NOW()
    │   │   │
    │   │   └─> Clear cookie
    │   │
    │   └─> ❌ NO → Session still valid
    │
    └─> Continue
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA FLOW DIAGRAM                            │
└─────────────────────────────────────────────────────────────────┘

CLIENT (Browser)
│
├─> User Action (Click "Impersonate")
│   │
│   └─> Client Component (accounts-list-container.tsx)
│       │
│       └─> Calls startImpersonationAction(userId, accountId)
│
│   SERVER ACTION (admin-actions.ts)
│   │
│   ├─> Get session user (getSessionUser)
│   │   │
│   │   └─> Returns current admin user
│   │
│   ├─> Check admin role (getAdminRole)
│   │   │
│   │   └─> Returns 'ADMIN' or 'SUPER_ADMIN'
│   │
│   ├─> Check permission (canImpersonateUser)
│   │   │
│   │   └─> Query AdminAccess table
│   │       │
│   │       └─> Returns true/false
│   │
│   ├─> Start impersonation (startImpersonation)
│   │   │
│   │   └─> IMPERSONATION SERVICE (impersonation-service.ts)
│   │       │
│   │       ├─> Validate target user
│   │       │   │
│   │       │   └─> Query User table
│   │       │
│   │       ├─> Check existing session
│   │       │   │
│   │       │   └─> Query ImpersonationSession table
│   │       │
│   │       ├─> Generate token (crypto.randomBytes)
│   │       │
│   │       └─> Create session
│   │           │
│   │           └─> INSERT INTO impersonation_sessions
│   │
│   ├─> Set cookie (cookies().set)
│   │   │
│   │   └─> HTTP-only cookie with session token
│   │
│   └─> Return success + redirect
│
└─> Browser redirects to /home

PAGE LOAD (Every Request)
│
├─> Root Layout (app/layout.tsx)
│   │
│   └─> ImpersonationBannerWrapper (Server Component)
│       │
│       ├─> Read cookie (cookies().get)
│       │   │
│       │   └─> Get 'impersonation-token'
│       │
│       ├─> Get session status (getImpersonationStatusByToken)
│       │   │
│       │   └─> Query ImpersonationSession
│       │       │
│       │       ├─> WHERE sessionToken = cookie value
│       │       ├─> AND isActive = true
│       │       │
│       │       └─> Returns session + user info
│       │
│       └─> Render ImpersonationBanner (Client Component)
│           │
│           ├─> Shows target user info
│           │
│           └─> "Return to Admin" button
│               │
│               └─> Calls endImpersonationAction()
│
└─> Page content renders as impersonated user

DATABASE TABLES
│
├─> users
│   ├─> id (UUID)
│   ├─> email
│   ├─> role (ACCOUNT_MANAGER | EMPLOYEE | ADMIN | SUPER_ADMIN)
│   └─> ... other fields
│
├─> admin_access
│   ├─> id (UUID)
│   ├─> admin_id → users.id
│   ├─> granted_by_user_id → users.id
│   ├─> account_id → accounts.id (optional)
│   ├─> granted_at (timestamp)
│   ├─> revoked_at (timestamp, nullable)
│   ├─> is_revoked (boolean)
│   ├─> expires_at (timestamp, nullable)
│   └─> notes (text, nullable)
│
└─> impersonation_sessions
    ├─> id (UUID)
    ├─> admin_id → users.id
    ├─> target_user_id → users.id
    ├─> account_id → accounts.id (optional)
    ├─> session_token (unique string)
    ├─> started_at (timestamp)
    ├─> ended_at (timestamp, nullable)
    ├─> is_active (boolean)
    ├─> auto_revoke_access (boolean)
    ├─> ip_address (string, nullable)
    └─> user_agent (string, nullable)
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING                               │
└─────────────────────────────────────────────────────────────────┘

TRY: Start Impersonation
│
├─> CATCH: Not authenticated
│   └─> Error: "Not authenticated"
│       └─> Redirect to /auth/sign-in
│
├─> CATCH: Not an admin
│   └─> Error: "Admin access required"
│       └─> Show toast error
│
├─> CATCH: No permission
│   └─> Error: "You do not have permission to impersonate this user"
│       └─> Show toast error with instructions
│
├─> CATCH: Target is super admin
│   └─> Error: "Cannot impersonate super admin"
│       └─> Show toast error
│
├─> CATCH: Target user not found
│   └─> Error: "Target user not found"
│       └─> Show toast error
│
├─> CATCH: Existing active session
│   └─> Error: "You already have an active impersonation session"
│       └─> Show toast error + link to end session
│
└─> CATCH: Database error
    └─> Error: "Failed to start impersonation"
        └─> Show toast error + log to console

TRY: End Impersonation
│
├─> CATCH: No active session
│   └─> Error: "No active impersonation session"
│       └─> Clear cookie + redirect
│
├─> CATCH: Session doesn't belong to user
│   └─> Error: "This session does not belong to you"
│       └─> Show toast error
│
└─> CATCH: Database error
    └─> Error: "Failed to end impersonation"
        └─> Show toast error + log to console

TRY: Grant Admin Access
│
├─> CATCH: Admin user not found
│   └─> Error: "Admin user not found"
│       └─> Show toast error
│
├─> CATCH: User doesn't have ADMIN role
│   └─> Error: "User must have ADMIN role"
│       └─> Show toast error
│
├─> CATCH: Not account owner
│   └─> Error: "Only account owner can grant admin access"
│       └─> Show toast error
│
├─> CATCH: Access already exists
│   └─> Error: "Admin access already granted"
│       └─> Show toast error
│
└─> CATCH: Database error
    └─> Error: "Failed to grant admin access"
        └─> Show toast error + log to console

TRY: Revoke Admin Access
│
├─> CATCH: Access not found
│   └─> Error: "Admin access not found or already revoked"
│       └─> Show toast error
│
├─> CATCH: Not authorized to revoke
│   └─> Error: "Only the granter or super admin can revoke access"
│       └─> Show toast error
│
└─> CATCH: Database error
    └─> Error: "Failed to revoke admin access"
        └─> Show toast error + log to console
```

---

These flow diagrams provide a comprehensive visual understanding of how the admin impersonation system works, from high-level user flows to detailed data flows and error handling.

