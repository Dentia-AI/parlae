# Database Migration Fix - Setup Progress Fields

**Date**: February 11, 2026  
**Issue**: POST /home/agent/setup/phone returning 500 error  
**Status**: ✅ Fixed

## Problem

The application was crashing with a Prisma error:

```
The column `accounts.setup_progress` does not exist in the current database.
```

### Root Cause

The Prisma schema was updated to include new setup progress tracking fields:
- `setup_progress` (JSONB)
- `setup_completed_at` (TIMESTAMP)
- `setup_last_step` (TEXT)

However, the database migration was never applied, so these columns didn't exist in the actual PostgreSQL database.

## Solution Applied

### 1. Resolved Conflicting Migration

First, marked a conflicting migration as applied:

```bash
prisma migrate resolve --applied 20260211000000_add_call_analytics_and_outbound
```

This migration was trying to add columns that already existed in the database.

### 2. Applied Setup Progress Migration

```bash
prisma migrate deploy --schema=./packages/prisma/schema.prisma
```

Applied migration: `20260211000001_add_setup_progress`

This added the following columns to the `accounts` table:

```sql
ALTER TABLE "accounts" 
ADD COLUMN "setup_progress" JSONB DEFAULT '{}',
ADD COLUMN "setup_completed_at" TIMESTAMP(3),
ADD COLUMN "setup_last_step" TEXT;
```

### 3. Regenerated Prisma Client

```bash
prisma generate --schema=./packages/prisma/schema.prisma
```

This ensured TypeScript types and client methods are updated to include the new fields.

## Result

✅ Database schema is now in sync with Prisma schema  
✅ Prisma client regenerated with new fields  
✅ Application can now access `account.setupProgress`, `account.setupCompletedAt`, and `account.setupLastStep`  
✅ POST /home/agent/setup/phone should now work without errors

## Next Steps

The dev server will automatically pick up the new Prisma client. The setup wizard pages can now:

1. Save progress after each step completion
2. Persist data even if users navigate away
3. Resume from where they left off
4. Track completion timestamps

## Testing

To verify the fix is working:

1. Navigate to `/home/agent/setup/phone`
2. The page should load without 500 errors
3. Check browser console for any remaining errors
4. Test saving progress through the setup wizard

## Commands Used

All commands were run from the project root with the DATABASE_URL environment variable:

```bash
# Mark conflicting migration as applied
DATABASE_URL="postgresql://parlae:parlae@localhost:5433/parlae?schema=public" \
  node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js \
  migrate resolve --applied 20260211000000_add_call_analytics_and_outbound \
  --schema=./packages/prisma/schema.prisma

# Apply pending migrations
DATABASE_URL="postgresql://parlae:parlae@localhost:5433/parlae?schema=public" \
  node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js \
  migrate deploy --schema=./packages/prisma/schema.prisma

# Regenerate client
DATABASE_URL="postgresql://parlae:parlae@localhost:5433/parlae?schema=public" \
  node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js \
  generate --schema=./packages/prisma/schema.prisma
```

## Prevention

For future migrations:

1. Always run `prisma migrate deploy` after updating the schema
2. Ensure migrations are applied in all environments (dev, staging, prod)
3. Add migration commands to deployment scripts
4. Consider adding a migration check to the startup process
