# Review Checklist

## Quick Start for Review

### 1. Prepare Environment (5 minutes)

```bash
# From project root
cd /Users/shaunk/Projects/Dentia/dentia

# Make script executable
chmod +x scripts/prepare-testing.sh

# Run preparation script
./scripts/prepare-testing.sh
```

### 2. Start Frontend (2 minutes)

```bash
cd apps/frontend
pnpm dev
```

Wait for:
```
✓ Ready in Xms
○ Local:   http://localhost:3000
```

### 3. Open Browser

Navigate to: http://localhost:3000

---

## What to Review

### 🎨 UI Components (10 minutes)

#### Account Selector
- [ ] Navigate to http://localhost:3000/home (after logging in)
- [ ] Find account selector in header (between menu and profile)
- [ ] Click to open dropdown
- [ ] Check searchability
- [ ] Verify "Create Client Account" button
- [ ] Check responsive design (resize browser)

#### Employee Management Page
- [ ] Navigate to http://localhost:3000/home/employees
- [ ] Check page layout and header
- [ ] Verify "Invite Employee" button
- [ ] Check empty states display correctly
- [ ] Verify responsive design

#### Invite Employee Form
- [ ] Click "Invite Employee" button
- [ ] Modal should open
- [ ] Check email input validation
- [ ] Check role selector dropdown
- [ ] Verify role descriptions
- [ ] Test form submission

#### Employees List
- [ ] After inviting and accepting invitations
- [ ] Verify employees display with avatars
- [ ] Check role badges
- [ ] Verify email display
- [ ] Check sorting (newest first)

#### Pending Invitations
- [ ] After creating invitations
- [ ] Verify invitation display
- [ ] Check expiration dates
- [ ] Verify role badges
- [ ] Check "Revoke" button (placeholder)

---

### 🔐 Authentication Flow (15 minutes)

#### Account Manager Signup
- [ ] Navigate to http://localhost:3000/auth/sign-up
- [ ] Fill form with test data
- [ ] Submit and verify success
- [ ] Check redirect to home
- [ ] Verify personal account created

**Test Data:**
```
Full Name: Test Manager
Email: test.manager@example.com
Password: Test1234
```

#### Password Features
- [ ] Test password visibility toggle (eye icon)
- [ ] Verify password validation:
  - [ ] Min 8 characters
  - [ ] At least 1 uppercase
  - [ ] At least 1 number
  - [ ] NO special character required
- [ ] Test "Repeat Password" validation

#### Employee Signup via Invitation
- [ ] Log in as account manager
- [ ] Invite employee from `/home/employees`
- [ ] Copy invitation link from console/logs
- [ ] Open link in incognito window
- [ ] Complete signup
- [ ] Verify employee role assigned

---

### 💾 Database Integrity (10 minutes)

Connect to your database and run these checks:

#### Check Users
```sql
SELECT id, email, "displayName", role FROM users ORDER BY "createdAt" DESC;
```

Expected:
- [ ] Account managers have role `ACCOUNT_MANAGER`
- [ ] Employees have role `EMPLOYEE`
- [ ] Display names are set correctly

#### Check Accounts
```sql
SELECT a.id, a.name, a."isPersonalAccount", u.email as owner 
FROM accounts a 
LEFT JOIN users u ON a."primaryOwnerId" = u.id;
```

Expected:
- [ ] Each account manager has a personal account
- [ ] Personal account name matches user display name
- [ ] `isPersonalAccount` is true for personal accounts

#### Check Memberships
```sql
SELECT 
  u.email,
  a.name as "accountName",
  am."roleName"
FROM account_memberships am
JOIN users u ON am."userId" = u.id
JOIN accounts a ON am."accountId" = a.id;
```

Expected:
- [ ] Account managers are "owner" of their personal account
- [ ] Employees have correct role (admin/editor/viewer)
- [ ] All memberships are valid

#### Check Roles and Permissions
```sql
-- Check roles exist
SELECT name, "hierarchyLevel" FROM roles ORDER BY "hierarchyLevel";

-- Check permission counts per role
SELECT r.name, COUNT(rp.*) as "permissionCount"
FROM roles r
LEFT JOIN role_permissions rp ON r.name = rp."roleName"
GROUP BY r.name
ORDER BY r."hierarchyLevel";
```

Expected:
- [ ] 4 roles: owner (1), admin (2), editor (3), viewer (4)
- [ ] Owner: 14 permissions
- [ ] Admin: 13 permissions (all except BILLING_MANAGE)
- [ ] Editor: 9 permissions (all view, create, edit)
- [ ] Viewer: 5 permissions (all view only)

---

### 🔄 User Flows (20 minutes)

#### Flow 1: Complete Account Manager Journey
1. [ ] Sign up as account manager
2. [ ] Verify redirect to /home
3. [ ] Check account selector shows personal account
4. [ ] Navigate to /home/employees
5. [ ] Verify empty states
6. [ ] Invite an employee
7. [ ] Verify invitation in "Pending" section
8. [ ] Check console for invitation link

#### Flow 2: Complete Employee Journey
1. [ ] Use invitation link from Flow 1
2. [ ] Sign up as employee
3. [ ] Verify account access
4. [ ] Check account selector shows employer's account
5. [ ] Verify role badge in account selector

#### Flow 3: Multiple Employees
1. [ ] Invite 3 employees with different roles:
   - [ ] Admin
   - [ ] Editor
   - [ ] Viewer
2. [ ] Verify all show in pending invitations
3. [ ] Accept all 3 invitations
4. [ ] Verify all show in employees list
5. [ ] Verify correct role badges

---

### 🎯 Feature Completeness (10 minutes)

#### Account Selector
- [ ] Shows personal account for account managers
- [ ] Shows accessible accounts for employees
- [ ] Displays role for each account
- [ ] Search functionality works
- [ ] "Create Client Account" option present
- [ ] Visual indicator for current account

#### Employee Management
- [ ] Can invite employees ✅
- [ ] Can view employees ✅
- [ ] Can view pending invitations ✅
- [ ] Can revoke invitations ⏳ (placeholder)
- [ ] Can edit employee roles ⏳ (future)
- [ ] Can remove employees ⏳ (future)

#### Roles & Permissions
- [ ] Owner role exists with all permissions
- [ ] Admin role exists (all except billing)
- [ ] Editor role exists (view + create + edit)
- [ ] Viewer role exists (view only)
- [ ] Permissions properly associated

---

### 📱 Responsive Design (5 minutes)

Test at different screen sizes:

#### Desktop (> 1024px)
- [ ] Account selector visible in header
- [ ] Employees page: 2-column grid
- [ ] Forms display correctly
- [ ] Navigation menu shows all items

#### Tablet (768px - 1024px)
- [ ] Account selector still visible
- [ ] Employees page: responsive grid
- [ ] Modals centered
- [ ] Touch-friendly buttons

#### Mobile (< 768px)
- [ ] Mobile navigation works
- [ ] Account selector accessible
- [ ] Forms stack vertically
- [ ] Modals full-width
- [ ] Touch-friendly spacing

---

### 🐛 Error Handling (5 minutes)

#### Invalid Invitation Token
- [ ] Try signup with invalid token
- [ ] Verify error message
- [ ] User not created

#### Expired Invitation
- [ ] Manually expire invitation in DB
- [ ] Try to use it
- [ ] Verify rejection

#### Weak Password
- [ ] Try password without uppercase
- [ ] Try password without number
- [ ] Try password too short
- [ ] Verify all show errors

#### Duplicate Email
- [ ] Try to invite same email twice
- [ ] Verify appropriate error

---

### 📊 Performance (5 minutes)

#### Page Load Times
- [ ] Home page: < 500ms
- [ ] Employees page: < 500ms
- [ ] Account selector: < 100ms

#### Database Queries
Run EXPLAIN ANALYZE on main queries:
- [ ] loadUserWorkspace: < 50ms
- [ ] loadEmployeesData: < 100ms
- [ ] loadUserAccounts: < 50ms

#### Network Requests
Open DevTools Network tab:
- [ ] No unnecessary re-fetches
- [ ] Proper caching headers
- [ ] No failed requests

---

### 🔍 Code Review Points

#### Type Safety
- [ ] No `any` types used
- [ ] Prisma types properly inferred
- [ ] Form types from Zod schemas

#### Error Handling
- [ ] All async operations wrapped in try-catch
- [ ] Errors logged with context
- [ ] User-friendly error messages

#### Code Organization
- [ ] Components in _components folders
- [ ] Server logic in _lib/server
- [ ] Reusable utilities extracted
- [ ] Clear file naming

#### Security
- [ ] Server actions use `enhanceAction`
- [ ] Authentication required for protected pages
- [ ] No sensitive data exposed to client
- [ ] Invite tokens properly validated

---

## Common Issues & Solutions

### Issue: Migrations Fail

```bash
# Reset and reapply
cd packages/prisma
pnpm prisma migrate reset --force
pnpm prisma migrate deploy
pnpm prisma db seed
```

### Issue: Frontend Won't Start

```bash
# Clear cache and reinstall
cd apps/frontend
rm -rf .next node_modules
pnpm install
pnpm dev
```

### Issue: Types Not Recognized

```bash
# Regenerate Prisma client
cd packages/prisma
pnpm prisma generate
```

### Issue: Can't See Invitation Link

Check:
1. Server console output
2. CloudWatch logs (if deployed)
3. Database directly:
   ```sql
   SELECT "inviteToken" FROM invitations ORDER BY "createdAt" DESC LIMIT 1;
   ```

---

## Documentation to Review

1. **E2E_TESTING_GUIDE.md** - Detailed testing scenarios
2. **STEP_5_COMPLETE.md** - Implementation details
3. **STEP_3_AND_4_COMPLETE.md** - Backend implementation
4. **NEW_ARCHITECTURE_PROPOSAL.md** - System architecture
5. **USER_ACCOUNT_CREATION_FLOW.md** - Account creation flow

---

## Sign-Off Checklist

Before marking complete:

- [ ] All UI components render correctly
- [ ] All user flows work end-to-end
- [ ] Database integrity verified
- [ ] No console errors
- [ ] No linting errors
- [ ] Performance is acceptable
- [ ] Responsive design works
- [ ] Error handling is robust
- [ ] Code is properly organized
- [ ] Documentation is complete

---

## Time Estimate

- Environment Setup: 5 min
- UI Review: 10 min
- Auth Flow: 15 min
- Database Checks: 10 min
- User Flows: 20 min
- Feature Check: 10 min
- Responsive: 5 min
- Error Handling: 5 min
- Performance: 5 min

**Total: ~85 minutes** (1.5 hours)

---

## Quick Command Reference

```bash
# Prepare environment
./scripts/prepare-testing.sh

# Start frontend
cd apps/frontend && pnpm dev

# Reset database
cd packages/prisma && pnpm prisma migrate reset --force

# Reseed database
cd packages/prisma && pnpm prisma db seed

# Check logs
tail -f apps/frontend/.next/logs/*

# Connect to database
psql -U your_user -d your_database
```

---

## Ready to Review?

1. ✅ Run `./scripts/prepare-testing.sh`
2. ✅ Start frontend with `pnpm dev`
3. ✅ Open http://localhost:3000
4. ✅ Follow **E2E_TESTING_GUIDE.md** scenarios
5. ✅ Check off items in this list
6. ✅ Document any issues found

**Happy Testing! 🚀**

