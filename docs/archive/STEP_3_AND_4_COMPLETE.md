# Steps 3 & 4: Employee Invitations + Permissions - COMPLETE ✅

## What We Built

### Step 3: Employee Invitation System

#### 1. **Core Functions** (`packages/shared/src/employee-management/`)

**`invite-employee.ts`** - Core invitation logic:
- `inviteEmployee()` - Invites an employee and grants access to specified accounts
- `acceptInvitation()` - Handles employee signup via invite token
- `revokeInvitation()` - Cancels an invitation

**Key Features:**
- ✅ Permission checking (only account owners/admins can invite)
- ✅ Multi-account access (invite to multiple accounts at once)
- ✅ Secure tokens (crypto-generated, 32-byte hex)
- ✅ Expiration (7 days)
- ✅ Idempotent (safe to call multiple times)

#### 2. **Server Actions** (`server-actions.ts`)

- `inviteEmployeeAction()` - Server action wrapper for inviting
- `acceptInvitationAction()` - Server action for accepting invites
- `revokeInvitationAction()` - Server action for revoking

**Features:**
- ✅ Zod validation
- ✅ Comprehensive logging
- ✅ Error handling
- ✅ Path revalidation

#### 3. **Updated Sign-Up Flow**

**Sign-Up API Route** (`app/api/auth/sign-up/route.ts`):
- ✅ Checks for `inviteToken` parameter
- ✅ If token present → Create as EMPLOYEE and accept invitation
- ✅ If no token → Create as ACCOUNT_MANAGER with default account

#### 4. **Schema & Validation** (`invite-employee.schema.ts`)

```typescript
InviteEmployeeSchema {
  email: string (email format)
  displayName?: string (optional)
  accountIds: string[] (min 1 account)
  roleName: 'admin' | 'editor' | 'viewer'
}
```

---

### Step 4: Permission Helpers

#### Permission Functions (`permissions.ts`)

1. **`hasPermission(userId, accountId, permission)`**
   - Checks if a user has a specific permission on an account
   - Returns true for account owners
   - Checks role permissions for members

2. **`getUserAccounts(userId)`**
   - Gets all accounts a user has access to
   - Returns accounts with their permissions and role
   - Ordered by creation date

3. **`getAccountEmployees(accountId)`**
   - Gets all employees/members of an account
   - Includes user info and role details
   - Ordered by join date

4. **`getAccountPermissions(userId, accountId)`**
   - Gets all permissions for a specific user-account pair
   - Returns full permission list for owners
   - Returns role-based permissions for members

5. **`canManageUser(managerId, targetUserId, accountId)`**
   - Checks if one user can manage another's role
   - Based on role hierarchy
   - Account owners can manage anyone

---

## How It Works

### Invitation Flow

```
┌─────────────────────────────────────────────────┐
│ 1. Account Manager Invites Employee            │
└─────────────────────────────────────────────────┘
                    ↓
      inviteEmployee({
        email: "employee@example.com",
        accountIds: ["account-1-id", "account-2-id"],
        roleName: "editor",
        invitedByUserId: "manager-id"
      })
                    ↓
      ┌─────────────────────────────┐
      │ Creates invitation records  │
      │ - inviteToken (secure)      │
      │ - expiresAt (7 days)        │
      │ - One per account           │
      └─────────────────────────────┘
                    ↓
      ┌─────────────────────────────┐
      │ Send invitation email       │
      │ (TODO: Email implementation)│
      │ Link: /auth/sign-up?        │
      │ invite=TOKEN                │
      └─────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 2. Employee Signs Up via Link                   │
└─────────────────────────────────────────────────┘
                    ↓
      Goes to: /auth/sign-up?invite=abc123...
                    ↓
      Fills form with inviteToken in hidden field
                    ↓
      POST /api/auth/sign-up with inviteToken
                    ↓
      ┌─────────────────────────────┐
      │ Cognito creates auth user   │
      │ Returns UserSub             │
      └─────────────────────────────┘
                    ↓
      acceptInvitation({
        inviteToken: "abc123...",
        userId: UserSub,
        email: "employee@example.com",
        displayName: "Employee Name"
      })
                    ↓
      ┌─────────────────────────────┐
      │ Creates User as EMPLOYEE    │
      │ - role: 'EMPLOYEE'          │
      │ - createdById: manager-id   │
      └─────────────────────────────┘
                    ↓
      ┌─────────────────────────────┐
      │ Creates AccountMemberships  │
      │ - One per invited account   │
      │ - With specified role       │
      └─────────────────────────────┘
                    ↓
      ┌─────────────────────────────┐
      │ Deletes used invitations    │
      └─────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 3. Employee Logs In & Has Access                │
└─────────────────────────────────────────────────┘
      getUserAccounts(employeeId)
                    ↓
      Returns: [
        {
          id: "account-1-id",
          name: "Account 1",
          permissions: ['CAMPAIGNS_VIEW', 'CAMPAIGNS_CREATE', ...],
          roleName: "editor"
        },
        {
          id: "account-2-id",
          name: "Account 2",
          permissions: ['CAMPAIGNS_VIEW', 'CAMPAIGNS_CREATE', ...],
          roleName: "editor"
        }
      ]
```

---

## Example Usage

### 1. Invite an Employee

```typescript
import { inviteEmployeeAction } from '@kit/shared/employee-management';

// In your server component or API
const result = await inviteEmployeeAction(
  {
    email: 'john@example.com',
    displayName: 'John Doe',
    accountIds: ['account-uuid-1', 'account-uuid-2'],
    roleName: 'editor',
  },
  currentUserId
);

if (result.success) {
  console.log('Invitation sent!');
  console.log('Token:', result.data.inviteToken);
  // TODO: Send email with link: `/auth/sign-up?invite=${result.data.inviteToken}`
}
```

### 2. Check Permissions

```typescript
import { hasPermission, getUserAccounts } from '@kit/shared/employee-management';

// Check if user can create campaigns
const canCreate = await hasPermission(
  userId,
  accountId,
  'CAMPAIGNS_CREATE'
);

if (canCreate) {
  // Show create campaign button
}

// Get all accounts user has access to
const accounts = await getUserAccounts(userId);
// accounts = [{ id, name, permissions, roleName }, ...]
```

### 3. Get Account Employees

```typescript
import { getAccountEmployees } from '@kit/shared/employee-management';

const employees = await getAccountEmployees(accountId);

/*
employees = [
  {
    user: { id, email, displayName, role },
    role: { name: 'editor', hierarchyLevel: 3 }
  },
  ...
]
*/
```

---

## Database Records Created

### Example: Inviting "john@example.com" as Editor to 2 Accounts

**Before Invitation:**
```sql
-- No user exists
-- No invitations
```

**After `inviteEmployee()`:**
```sql
-- invitations table
INSERT INTO invitations (
  account_id,
  email,
  invite_token,
  invited_by,
  role,
  expires_at
) VALUES
  ('account-1-id', 'john@example.com', 'abc123...', 'manager-id', 'editor', '2025-11-11'),
  ('account-2-id', 'john@example.com', 'abc123...', 'manager-id', 'editor', '2025-11-11');
```

**After Employee Signs Up:**
```sql
-- users table
INSERT INTO users (
  id,
  email,
  display_name,
  role,
  created_by_id
) VALUES (
  'employee-user-sub',
  'john@example.com',
  'John Doe',
  'EMPLOYEE',
  'manager-id'
);

-- accounts_memberships table
INSERT INTO accounts_memberships (
  account_id,
  user_id,
  account_role
) VALUES
  ('account-1-id', 'employee-user-sub', 'editor'),
  ('account-2-id', 'employee-user-sub', 'editor');

-- invitations deleted
DELETE FROM invitations WHERE invite_token = 'abc123...';
```

---

## Security Features

### 1. **Permission Validation**
- ✅ Only account owners or users with `INVITES_MANAGE` can invite
- ✅ Checked for EACH account in the invitation

### 2. **Secure Tokens**
- ✅ 32-byte cryptographically random
- ✅ Hex-encoded (64 characters)
- ✅ Single-use (deleted after acceptance)

### 3. **Expiration**
- ✅ 7-day expiration
- ✅ Checked during acceptance
- ✅ Expired invitations automatically rejected

### 4. **Role Hierarchy**
- ✅ Users can only manage users with lower hierarchy
- ✅ Account owners can manage anyone
- ✅ Prevents privilege escalation

### 5. **Logging**
- ✅ All operations logged with context
- ✅ Success and failure cases
- ✅ Sensitive data (tokens) included for debugging

---

## What's Left to Build

### Step 5: UI Components (Next)

1. **Account Selector Component**
   - Dropdown to switch between accounts
   - Shows user's role on each account
   - Filters content based on selected account

2. **Employee Management Dashboard**
   - List all employees with access
   - Invite new employees
   - Manage roles
   - Revoke access

3. **Invitation Form**
   - Multi-account selector
   - Role selector (admin/editor/viewer)
   - Email input
   - Send invitation

4. **Employee Sign-Up Page**
   - Parse invite token from URL
   - Pre-fill email if provided
   - Show which accounts they're being invited to
   - Complete signup flow

---

## Testing the Invitation System

### Manual Test (No UI Yet)

You can test using the functions directly:

```typescript
// In a server action or API route
import { inviteEmployee } from '@kit/shared/employee-management';
import { prisma } from '@kit/prisma';

// 1. Get your account manager user ID
const manager = await prisma.user.findUnique({
  where: { email: 'your-email@example.com' },
});

// 2. Get your account ID
const account = await prisma.account.findFirst({
  where: { primaryOwnerId: manager.id },
});

// 3. Invite an employee
const result = await inviteEmployee({
  email: 'employee@test.com',
  displayName: 'Test Employee',
  accountIds: [account.id],
  roleName: 'editor',
  invitedByUserId: manager.id,
});

console.log('Invite token:', result.inviteToken);

// 4. Employee signs up at:
// http://localhost:3000/auth/sign-up?invite=PASTE_TOKEN_HERE
```

### Check in Database

```sql
-- View invitations
SELECT * FROM invitations;

-- After employee signs up, check:
SELECT * FROM users WHERE email = 'employee@test.com';
SELECT * FROM accounts_memberships WHERE user_id = 'EMPLOYEE_USER_ID';
```

---

## Production Deployment

### Migration Commands

```bash
# In production (ECS, CI/CD, etc.)
cd packages/prisma

# Apply migrations
pnpm prisma migrate deploy

# Generate client
pnpm prisma generate

# Run seed (creates roles if not exists)
pnpm prisma db seed
```

### Environment Variables

No new environment variables needed! Everything uses existing:
- `DATABASE_URL` - Prisma connection
- Cognito vars for signup flow

---

## Summary

✅ **Step 1:** Database schema with roles and permissions  
✅ **Step 2:** Sign-up flow creates default account  
✅ **Step 3:** Complete invitation system with secure tokens  
✅ **Step 4:** Permission helper functions  
⏳ **Step 5:** UI components (next!)  

**Ready to build the UI!** 🎨

