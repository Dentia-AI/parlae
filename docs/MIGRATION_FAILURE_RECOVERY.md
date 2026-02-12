# Migration Failure Recovery

## What Happened

Migration `20260212000001_make_shaun_super_admin` failed because:
- ❌ SQL referenced `roles` (plural/array) column
- ✅ Actual column is `role` (singular enum)

Error:
```
column "roles" does not exist
HINT: Perhaps you meant to reference the column "users.role"
```

## Impact

When a Prisma migration fails:
- Migration is marked as failed in `_prisma_migrations` table
- Prisma **blocks all future migrations** until the failure is resolved
- The app still starts but database schema is incomplete

## Fixes Applied

### 1. Fixed the Migration SQL

Changed from:
```sql
SET roles = array_append(roles, 'super-admin')
```

To:
```sql
SET role = 'super_admin'
```

### 2. Updated migrate-and-start.sh

Added automatic recovery for failed migrations:
1. Detect migration failure
2. Run `prisma migrate resolve --rolled-back` on failed migration
3. Retry `prisma migrate deploy`
4. If still fails, start app anyway (with warning)

This prevents the container from crashing when migrations fail.

## Deploy the Fix

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae

# Stage the fixes
git add packages/prisma/migrations/20260212000001_make_shaun_super_admin/migration.sql
git add scripts/migrate-and-start.sh
git add docs/

# Commit
git commit -m "fix: Correct super admin migration SQL and add auto-recovery

- Fix: Use 'role' enum instead of 'roles' array
- Add automatic migration failure recovery to migrate-and-start.sh
- Prevents container crash on migration failures"

# Push to deploy
git push origin main
```

## What Will Happen

1. New Docker image built with fixed migration
2. Container starts and runs migrations
3. Script detects the previously failed migration
4. Marks it as rolled back
5. Re-applies the corrected migration
6. ✅ User gets super_admin role
7. ✅ All other pending migrations also apply
8. ✅ App starts successfully

## Verification

After deployment, check:
```bash
# Logs should show
aws logs tail /ecs/parlae-frontend --since 5m --region us-east-2 --profile parlae | grep -A 5 "Migration"

# Should see:
# ✅ Migrations completed successfully
# (Not: ❌ Migration failed)
```

Then test dashboard - no more 500 errors!
