# Database Migration Fix - phone_integration_method

## Problem

Sign-up was failing with error:
```
The column `accounts.phone_integration_method` does not exist in the current database.
```

## Root Cause

The Prisma schema included `phoneIntegrationMethod` field, but the corresponding database migration was never applied to production. The migration SQL existed in `migrations/add_ai_receptionist_fields.sql` but it wasn't in the proper Prisma migrations format.

## Solution

Created proper Prisma migration: `20260212000000_add_phone_integration_fields`

This migration adds:
- `accounts.phone_integration_method` column (TEXT with CHECK constraint)
- `accounts.phone_integration_settings` column (JSONB)
- Index on `phone_integration_method` for performance

## Deployment

The migration will run automatically when you deploy:

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae

# Stage the new migration
git add packages/prisma/migrations/20260212000000_add_phone_integration_fields/

# Commit
git commit -m "fix: Add missing phone_integration_method database migration"

# Push - this will trigger deployment
git push origin main
```

## How It Works

1. Docker container starts with `migrate-and-start.sh` entrypoint
2. Script runs `prisma migrate deploy` before starting the app
3. Prisma applies any pending migrations (including our new one)
4. App starts with database up-to-date

## Verification

After deployment, check ECS logs for:
```
✅ Migrations completed successfully
🚀 Starting application...
```

Then test sign-up - should work without the phone_integration_method error!

## Files Changed

- `packages/prisma/migrations/20260212000000_add_phone_integration_fields/migration.sql` (NEW)

## Notes

- The migration uses `ADD COLUMN IF NOT EXISTS` so it's safe to run multiple times
- Existing accounts will get `phone_integration_method = 'none'` by default
- The migration is idempotent (safe to re-run)
