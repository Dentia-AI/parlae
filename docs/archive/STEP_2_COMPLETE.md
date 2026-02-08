# Step 2: Update Sign-Up Flow - COMPLETE ✅

## What We Changed

### Updated `ensureUserProvisioned` Function

Location: `apps/frontend/packages/shared/src/auth/ensure-user.ts`

**Changes Made:**

1. **Set User Role to ACCOUNT_MANAGER**
   ```typescript
   user = await tx.user.create({
     data: {
       id: intendedUserId,
       email,
       displayName,
       role: 'ACCOUNT_MANAGER', // ← New!
     },
   });
   ```

2. **Account Name Matches User Name**
   ```typescript
   // Before: name: `${accountBaseName}'s Workspace`
   // After:  name: accountBaseName
   
   account = await tx.account.create({
     data: {
       name: accountBaseName, // ← Same as user's displayName
       slug,
       isPersonalAccount: true,
       primaryOwnerId: user.id,
       email,
     },
   });
   ```

## Sign-Up Flow Now

### When a User Signs Up:

```
1. User fills signup form
   - Full Name: "John Doe"
   - Email: "john@example.com"
   - Password: "Password123"

2. Cognito creates auth user
   - UserSub: "abc-123-..."
   - Attributes: email, name

3. ensureUserProvisioned() called
   ↓
   Creates User:
   - id: "abc-123-..."
   - email: "john@example.com"
   - displayName: "John Doe"
   - role: "ACCOUNT_MANAGER" ← New!
   ↓
   Creates Default Account:
   - name: "John Doe" ← Matches user name!
   - slug: "john-doe"
   - isPersonalAccount: true
   - primaryOwnerId: "abc-123-..."
   ↓
   Creates Membership:
   - userId: "abc-123-..."
   - accountId: account.id
   - roleName: "owner" ← Full permissions!
```

## What Users Get

### Example for "John Doe":

**User Record:**
```javascript
{
  id: "abc-123-...",
  email: "john@example.com",
  displayName: "John Doe",
  role: "ACCOUNT_MANAGER", // ← Can create employees
  createdById: null
}
```

**Default Account:**
```javascript
{
  id: "xyz-789-...",
  name: "John Doe", // ← Same as user's name
  slug: "john-doe",
  isPersonalAccount: true,
  primaryOwnerId: "abc-123-...",
  email: "john@example.com"
}
```

**Account Membership:**
```javascript
{
  accountId: "xyz-789-...",
  userId: "abc-123-...",
  roleName: "owner" // ← Has all 14 permissions
}
```

## Permissions They Have

As an "owner" of their default account, they can:
- ✅ Create/edit/delete campaigns
- ✅ Create/edit/delete ads
- ✅ View analytics
- ✅ Manage billing
- ✅ Invite employees
- ✅ Manage settings
- ✅ Everything!

## Testing the Changes

### Test Sign-Up:

```bash
# 1. Start your frontend
cd /Users/shaunk/Projects/Dentia/dentia/apps/frontend
pnpm run dev

# 2. Go to: http://localhost:3000/auth/sign-up
# 3. Sign up with:
#    - Name: Test Manager
#    - Email: manager@test.com
#    - Password: TestPass123

# 4. Check the database:
cd /Users/shaunk/Projects/Dentia/dentia/packages/prisma
pnpm prisma studio
```

### Verify in Database:

**Check User:**
```sql
SELECT id, email, display_name, role, created_by_id
FROM users
WHERE email = 'manager@test.com';
```

Expected:
- role: `account_manager`
- created_by_id: `NULL` (not created by anyone)

**Check Account:**
```sql
SELECT id, name, slug, is_personal_account, primary_owner_user_id
FROM accounts
WHERE email = 'manager@test.com';
```

Expected:
- name: `Test Manager` (same as user's display name)
- is_personal_account: `true`
- slug: `test-manager`

**Check Membership:**
```sql
SELECT account_id, user_id, account_role
FROM accounts_memberships
WHERE user_id = 'USER_ID_FROM_ABOVE';
```

Expected:
- account_role: `owner`

## Next Steps

Now we can move to:

### Step 3: Employee Invitation System
- Create API to invite employees
- Send invitation emails
- Handle employee sign-up via invite link
- Grant employees access to specific accounts

### Step 4: Permission Helpers
- `hasPermission(userId, accountId, permission)`
- `getUserAccounts(userId)` 
- `getAccountEmployees(accountId)`

### Step 5: UI Components
- Account selector
- Employee management dashboard
- Permission editor

## Current Status

✅ Step 1: Database schema updated  
✅ Step 2: Sign-up flow updated  
⏳ Step 3: Employee invitations (next)  
⏳ Step 4: Permission helpers (after that)  
⏳ Step 5: UI components (final)  

