# Step 1: Database Schema - COMPLETE ✅

## What We Changed

### 1. Added `UserRole` Enum
```prisma
enum UserRole {
  ACCOUNT_MANAGER @map("account_manager")
  EMPLOYEE        @map("employee")
}
```

### 2. Updated `User` Model
**Added fields:**
- `role`: Distinguishes account managers from employees (defaults to ACCOUNT_MANAGER)
- `createdById`: Tracks which account manager created an employee
- `createdBy` / `createdEmployees`: Relations for employee management

### 3. Extended `AppPermission` Enum
**Added campaign/ad permissions:**
- `CAMPAIGNS_VIEW`
- `CAMPAIGNS_CREATE`
- `CAMPAIGNS_EDIT`
- `CAMPAIGNS_DELETE`
- `ADS_VIEW`
- `ADS_CREATE`
- `ADS_EDIT`
- `ADS_DELETE`
- `ANALYTICS_VIEW`

### 4. Updated Seed File
**Creates 4 default roles with permissions:**

| Role   | Hierarchy | Permissions                                          |
|--------|-----------|------------------------------------------------------|
| owner  | 1         | ALL (14 permissions) - Full access                   |
| admin  | 2         | ALL except BILLING_MANAGE (13 permissions)           |
| editor | 3         | View, Create, Edit campaigns/ads + Analytics (7)     |
| viewer | 4         | View-only access (3 permissions)                     |

## Next Steps

### Generate Migration & Apply

```bash
# Navigate to the prisma package
cd /Users/shaunk/Projects/Dentia/dentia/packages/prisma

# Generate Prisma Client
pnpm prisma generate

# Create migration
pnpm prisma migrate dev --name add_user_roles_and_permissions

# Run seed to create roles
pnpm prisma db seed
```

### What This Migration Will Do

1. **Add columns to `users` table:**
   - `role` (enum: account_manager | employee, default: account_manager)
   - `created_by_id` (nullable UUID foreign key)

2. **Add permissions to `app_permission` enum:**
   - All the new campaign/ad permissions

3. **Populate `roles` table:**
   - owner, admin, editor, viewer

4. **Populate `role_permissions` table:**
   - Map each role to its permissions

## Current Database State

Your existing data will be preserved:
- ✅ All existing users will have `role = 'account_manager'` (default)
- ✅ All existing accounts remain unchanged
- ✅ All existing memberships remain intact
- ✅ New roles and permissions are added

## Ready for Step 2?

Once the migration succeeds, we'll move to **Step 2: Update Sign-Up Flow** to:
- Modify `ensureUserProvisioned` to create default account
- Ensure account managers get their default account on signup

