# End-to-End Testing Guide

## Overview

This guide walks you through testing the complete multi-tenant agency platform with account manager and employee roles.

## Prerequisites

- Local development environment set up
- Database (PostgreSQL) running
- Cognito user pool configured
- All environment variables set

## Test Scenarios

### Scenario 1: Account Manager Signup and Default Account Creation

**Objective**: Verify that when an account manager signs up, they get a personal account automatically.

**Steps:**

1. **Navigate to Sign-Up Page**
   ```
   http://localhost:3000/auth/sign-up
   ```

2. **Fill out the form:**
   - Full Name: `John Manager`
   - Email: `john.manager@example.com`
   - Password: `Test1234` (must have uppercase, number)
   - Confirm Password: `Test1234`
   - Accept Terms: ✓

3. **Submit the form**

4. **Expected Results:**
   - ✅ User is created in Cognito
   - ✅ User record created in database with role `ACCOUNT_MANAGER`
   - ✅ Personal account created with name "John Manager"
   - ✅ Account membership created with role "owner"
   - ✅ Success message displayed
   - ✅ User redirected to home page

5. **Verify in Database:**
   ```sql
   -- Check user was created
   SELECT id, email, "displayName", role FROM users WHERE email = 'john.manager@example.com';
   
   -- Check personal account was created
   SELECT id, name, slug, "isPersonalAccount", "primaryOwnerId" 
   FROM accounts 
   WHERE "primaryOwnerId" = (SELECT id FROM users WHERE email = 'john.manager@example.com');
   
   -- Check membership was created
   SELECT am."accountId", am."userId", am."roleName" 
   FROM account_memberships am
   JOIN users u ON am."userId" = u.id
   WHERE u.email = 'john.manager@example.com';
   ```

---

### Scenario 2: Account Manager Invites Employee

**Objective**: Verify that an account manager can invite employees to their account.

**Steps:**

1. **Log in as Account Manager**
   - Email: `john.manager@example.com`
   - Password: `Test1234`

2. **Navigate to Employees Page**
   ```
   http://localhost:3000/home/employees
   ```

3. **Expected View:**
   - ✅ "Employees" page header visible
   - ✅ "Invite Employee" button visible
   - ✅ Empty state message (no employees yet)
   - ✅ Empty state for pending invitations

4. **Click "Invite Employee" Button**

5. **Fill out the invitation form:**
   - Email: `jane.employee@example.com`
   - Role: `Editor` (Can create and edit campaigns/ads)

6. **Submit the form**

7. **Expected Results:**
   - ✅ Success toast: "Invitation sent successfully!"
   - ✅ Modal closes
   - ✅ Invitation appears in "Pending Invitations" section
   - ✅ Console shows invitation link (check server logs)

8. **Verify in Database:**
   ```sql
   -- Check invitation was created
   SELECT id, email, "roleName", "inviteToken", "expiresAt", "invitedBy"
   FROM invitations
   WHERE email = 'jane.employee@example.com';
   ```

9. **Copy the Invite Token from logs** (or from database)

---

### Scenario 3: Employee Accepts Invitation

**Objective**: Verify that an employee can sign up using an invitation link.

**Steps:**

1. **Get Invitation Link**
   - From console logs: Look for `Invitation Link: http://localhost:3000/auth/sign-up?inviteToken=...`
   - Or construct manually: `http://localhost:3000/auth/sign-up?inviteToken=<TOKEN_FROM_DB>`

2. **Open invitation link in incognito/private window**
   ```
   http://localhost:3000/auth/sign-up?inviteToken=<YOUR_TOKEN>
   ```

3. **Fill out the sign-up form:**
   - Full Name: `Jane Employee`
   - Email: `jane.employee@example.com` (must match invitation)
   - Password: `Test1234`
   - Confirm Password: `Test1234`
   - Accept Terms: ✓

4. **Submit the form**

5. **Expected Results:**
   - ✅ User is created in Cognito
   - ✅ User record created with role `EMPLOYEE`
   - ✅ User added to the account with role `editor`
   - ✅ Invitation is deleted from database
   - ✅ Success message displayed
   - ✅ User redirected to home page

6. **Verify in Database:**
   ```sql
   -- Check employee user was created
   SELECT id, email, "displayName", role FROM users WHERE email = 'jane.employee@example.com';
   
   -- Check employee has membership
   SELECT am."accountId", am."userId", am."roleName", a.name as "accountName"
   FROM account_memberships am
   JOIN users u ON am."userId" = u.id
   JOIN accounts a ON am."accountId" = a.id
   WHERE u.email = 'jane.employee@example.com';
   
   -- Check invitation was deleted
   SELECT * FROM invitations WHERE email = 'jane.employee@example.com';
   -- Should return no rows
   ```

---

### Scenario 4: View Employees List as Account Manager

**Objective**: Verify that the account manager can see their employees.

**Steps:**

1. **Log in as Account Manager** (if not already)
   - Email: `john.manager@example.com`

2. **Navigate to Employees Page**
   ```
   http://localhost:3000/home/employees
   ```

3. **Expected View:**
   - ✅ "Employees" section shows Jane Employee
   - ✅ Jane's email displayed: `jane.employee@example.com`
   - ✅ Role badge shows "editor"
   - ✅ Profile avatar displayed
   - ✅ No pending invitations (Jane accepted hers)

4. **Verify Employee Count:**
   - Should show 1 employee (Jane)
   - Account manager (John) should NOT appear in the list

---

### Scenario 5: Account Selector

**Objective**: Verify that users can see all accounts they have access to.

**Steps:**

1. **Log in as Account Manager**
   - Email: `john.manager@example.com`

2. **Locate Account Selector**
   - Should be in the header, between navigation menu and profile dropdown
   - Should display "John Manager" (current account)

3. **Click Account Selector**

4. **Expected View:**
   - ✅ Dropdown opens
   - ✅ "Personal Account" section visible
   - ✅ "John Manager" account listed
   - ✅ Checkmark on current account
   - ✅ "Create Client Account" option at bottom
   - ✅ Search box at top

5. **Test Search:**
   - Type "john" in search box
   - ✅ "John Manager" account still visible
   - Type "xyz" in search box
   - ✅ "No accounts found" message

6. **Close dropdown** (click outside or press Escape)

7. **Now log in as Employee**
   - Log out
   - Log in as `jane.employee@example.com`

8. **Check Account Selector as Employee**
   - ✅ Should show "John Manager" account
   - ✅ Role badge should show "editor"
   - ✅ No "Personal Account" section (employee doesn't have personal account yet)

---

### Scenario 6: Multiple Employees with Different Roles

**Objective**: Verify that different employee roles are correctly assigned.

**Steps:**

1. **Log in as Account Manager**

2. **Invite Admin Employee**
   - Email: `admin.employee@example.com`
   - Role: `Admin`

3. **Invite Viewer Employee**
   - Email: `viewer.employee@example.com`
   - Role: `Viewer`

4. **Check Pending Invitations**
   - ✅ Both invitations visible
   - ✅ Roles correctly displayed
   - ✅ Expiration dates shown (7 days from now)

5. **Accept Both Invitations** (use incognito windows)

6. **View Employees List**
   - ✅ 3 employees total (Jane, Admin, Viewer)
   - ✅ Each shows correct role badge
   - ✅ All sorted by creation date (newest first)

---

### Scenario 7: Password Validation

**Objective**: Verify password requirements are enforced.

**Steps:**

1. **Navigate to Sign-Up Page**

2. **Test Weak Passwords:**
   
   a. **Too Short**
   - Password: `Test1`
   - ✅ Error: Password must be at least 8 characters
   
   b. **No Number**
   - Password: `TestTest`
   - ✅ Error: Password must contain at least one number
   
   c. **No Uppercase**
   - Password: `test1234`
   - ✅ Error: Password must contain at least one uppercase letter
   
   d. **Valid Password** (no special character required anymore)
   - Password: `Test1234`
   - ✅ No error, form submits

---

### Scenario 8: Password Visibility Toggle

**Objective**: Verify password visibility toggle works.

**Steps:**

1. **Navigate to Sign-Up Page**

2. **Type a password** in the "Password" field

3. **Check Initial State:**
   - ✅ Password is masked (shows bullets)
   - ✅ Eye icon visible on right side

4. **Click Eye Icon**
   - ✅ Password becomes visible (plain text)
   - ✅ Icon changes to "eye-off"

5. **Click Icon Again**
   - ✅ Password masked again
   - ✅ Icon changes back to "eye"

6. **Repeat for "Repeat Password" field**
   - ✅ Same behavior

---

### Scenario 9: Expired Invitation

**Objective**: Verify that expired invitations cannot be used.

**Steps:**

1. **Manually expire an invitation in database:**
   ```sql
   -- Create a test invitation
   INSERT INTO invitations (email, "roleName", "inviteToken", "accountId", "invitedBy", "expiresAt")
   SELECT 
     'expired@example.com',
     'viewer',
     gen_random_uuid()::text,
     a.id,
     u.id,
     NOW() - INTERVAL '1 day'
   FROM accounts a
   JOIN users u ON a."primaryOwnerId" = u.id
   WHERE u.email = 'john.manager@example.com'
   LIMIT 1
   RETURNING *;
   ```

2. **Copy the invite token**

3. **Try to sign up with expired token**
   ```
   http://localhost:3000/auth/sign-up?inviteToken=<EXPIRED_TOKEN>
   ```

4. **Fill out form and submit**

5. **Expected Results:**
   - ✅ Error message: "Invitation expired"
   - ✅ User is NOT created
   - ✅ No account membership created

---

## Database Verification Queries

Use these queries to verify the system state at any point:

### Check All Users and Their Roles
```sql
SELECT 
  u.id,
  u.email,
  u."displayName",
  u.role,
  u."createdAt"
FROM users u
ORDER BY u."createdAt" DESC;
```

### Check All Accounts
```sql
SELECT 
  a.id,
  a.name,
  a.slug,
  a."isPersonalAccount",
  u.email as "ownerEmail"
FROM accounts a
LEFT JOIN users u ON a."primaryOwnerId" = u.id
ORDER BY a."createdAt" DESC;
```

### Check All Memberships
```sql
SELECT 
  u.email as "userEmail",
  u.role as "userRole",
  a.name as "accountName",
  am."roleName" as "membershipRole"
FROM account_memberships am
JOIN users u ON am."userId" = u.id
JOIN accounts a ON am."accountId" = a.id
ORDER BY am."createdAt" DESC;
```

### Check All Invitations (Pending)
```sql
SELECT 
  i.email,
  i."roleName",
  i."expiresAt",
  i."createdAt",
  a.name as "accountName",
  u.email as "invitedByEmail"
FROM invitations i
JOIN accounts a ON i."accountId" = a.id
JOIN users u ON i."invitedBy" = u.id
WHERE i."expiresAt" > NOW()
ORDER BY i."createdAt" DESC;
```

### Check Roles and Permissions
```sql
-- View all roles
SELECT r.name, r."hierarchyLevel"
FROM roles r
ORDER BY r."hierarchyLevel";

-- View permissions per role
SELECT 
  r.name as "roleName",
  rp.permission
FROM roles r
JOIN role_permissions rp ON r.name = rp."roleName"
ORDER BY r."hierarchyLevel", rp.permission;
```

---

## Troubleshooting

### Issue: User not redirected after signup

**Possible Causes:**
- NextAuth session not created
- Cognito user not confirmed

**Solution:**
1. Check CloudWatch logs for Cognito errors
2. Verify `COGNITO_CLIENT_ID` and `COGNITO_CLIENT_SECRET` are correct
3. Check if email verification is required in Cognito settings

### Issue: Invitation link doesn't work

**Possible Causes:**
- Invitation expired
- Token mismatch
- Invitation already used

**Solution:**
1. Check invitation in database:
   ```sql
   SELECT * FROM invitations WHERE "inviteToken" = '<YOUR_TOKEN>';
   ```
2. Verify `expiresAt` is in the future
3. Create a new invitation if needed

### Issue: Employee doesn't appear in list

**Possible Causes:**
- Employee user has role `ACCOUNT_MANAGER` instead of `EMPLOYEE`
- Membership not created
- Database transaction failed

**Solution:**
1. Check user role:
   ```sql
   SELECT role FROM users WHERE email = '<EMPLOYEE_EMAIL>';
   ```
2. Check membership:
   ```sql
   SELECT * FROM account_memberships WHERE "userId" = (
     SELECT id FROM users WHERE email = '<EMPLOYEE_EMAIL>'
   );
   ```
3. Check CloudWatch logs for transaction errors

### Issue: Account selector shows no accounts

**Possible Causes:**
- `loadUserAccounts` function not loading data
- User has no memberships
- Personal account not created

**Solution:**
1. Check if user has accounts:
   ```sql
   SELECT a.* FROM accounts a
   LEFT JOIN account_memberships am ON a.id = am."accountId"
   WHERE a."primaryOwnerId" = '<USER_ID>' OR am."userId" = '<USER_ID>';
   ```
2. Check browser console for errors
3. Verify `loadUserWorkspace` is being called

---

## Performance Checks

### Check Query Performance

1. **User Workspace Load Time**
   - Should be < 100ms
   - Check with: `EXPLAIN ANALYZE` on queries in `loadUserWorkspace`

2. **Employees Page Load Time**
   - Should be < 200ms
   - Check with: `EXPLAIN ANALYZE` on queries in `loadEmployeesData`

### Optimize if Needed

```sql
-- Add indexes if queries are slow
CREATE INDEX IF NOT EXISTS idx_account_memberships_user_id ON account_memberships("userId");
CREATE INDEX IF NOT EXISTS idx_account_memberships_account_id ON account_memberships("accountId");
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations("inviteToken");
CREATE INDEX IF NOT EXISTS idx_invitations_expires ON invitations("expiresAt");
```

---

## Test Data Cleanup

After testing, clean up test data:

```sql
-- Delete test users (cascades to memberships)
DELETE FROM users WHERE email LIKE '%@example.com';

-- Delete test accounts (if any remain)
DELETE FROM accounts WHERE email LIKE '%@example.com';

-- Delete test invitations
DELETE FROM invitations WHERE email LIKE '%@example.com';
```

---

## Automated Test Script (Optional)

For repeated testing, you can use this script:

```bash
#!/bin/bash
# test-e2e.sh

echo "🧪 Starting E2E Tests..."

# Reset database
echo "📦 Resetting database..."
cd packages/prisma
pnpm prisma migrate reset --force
pnpm prisma db seed

# Start frontend
echo "🚀 Starting frontend..."
cd ../../apps/frontend
pnpm dev &
FRONTEND_PID=$!

# Wait for frontend to start
sleep 10

echo "✅ Frontend started at http://localhost:3000"
echo "🔍 Open browser and follow E2E_TESTING_GUIDE.md"
echo ""
echo "Press Ctrl+C to stop frontend..."

# Wait for user to stop
wait $FRONTEND_PID
```

---

## Success Criteria

All scenarios should pass with ✅ checkmarks. The system is ready for production when:

- ✅ Account managers can sign up and get personal accounts
- ✅ Account managers can invite employees
- ✅ Employees can accept invitations and access accounts
- ✅ Role-based permissions are correctly assigned
- ✅ Account selector shows all accessible accounts
- ✅ Employees list displays correctly
- ✅ Pending invitations are tracked
- ✅ Password validation works as expected
- ✅ Password visibility toggle works
- ✅ Expired invitations are rejected
- ✅ Database integrity is maintained
- ✅ All queries perform well (< 200ms)
- ✅ No console errors in browser or server logs

---

## Next Steps After Testing

1. **Add Email Service Integration**
   - Replace console.log with actual email sending
   - Use SendGrid, AWS SES, or similar

2. **Add Revoke Invitation**
   - Implement the `onRevoke` handler
   - Add server action to delete invitation

3. **Add Edit Employee Role**
   - Create form to update employee role
   - Add permission checks

4. **Add Remove Employee**
   - Create confirmation dialog
   - Add server action to remove membership

5. **Implement Client Account Context**
   - Create routes for `/home/accounts/[accountId]`
   - Add account switching logic
   - Context-specific data filtering

6. **Add Translation Files**
   - Add all i18n keys to translation files
   - Support multiple languages

7. **Deploy to Production**
   - Run migrations on production database
   - Test with real email sending
   - Monitor CloudWatch logs

