# Production Migration Error Fix

## The Problem

**Error**: `P3018 - relation "vapi_phone_numbers" already exists`

This means:
- ❌ The table `vapi_phone_numbers` **already exists** in production
- ❌ But Prisma's `_prisma_migrations` table doesn't show the migration as applied
- ❌ New migrations are blocked until this is resolved

### Why This Happened

Common causes:
1. Table was created manually (outside of Prisma migrations)
2. Previous migration partially failed but table was created
3. Migration history table got out of sync
4. Database was restored from backup without migration history

## The Fix

### Option 1: Mark Migration as Applied (Recommended)

This tells Prisma "yes, this migration has been applied" without actually running it.

**Step 1**: Connect to production database
```bash
# Set production database URL
export DATABASE_URL="postgresql://user:password@parlae-aurora-cluster.cluster-cpe42k4icbjd.us-east-2.rds.amazonaws.com:5432/dentia"
```

**Step 2**: Mark the migration as resolved
```bash
cd packages/prisma

# Mark the migration as applied (rolled-forward)
npx prisma migrate resolve --applied 20260209000000_add_vapi_phone_numbers
```

This adds an entry to `_prisma_migrations` saying the migration was successful, without actually running the SQL.

**Step 3**: Try migrations again
```bash
npx prisma migrate deploy
```

### Option 2: Fix via AWS ECS Task (If you can't connect directly)

If you can't access the database from your local machine, create a one-time ECS task:

**Create**: `scripts/fix-migration.sh`
```bash
#!/bin/bash
set -e

echo "🔧 Fixing migration state..."

# Mark migration as applied
npx prisma migrate resolve --applied 20260209000000_add_vapi_phone_numbers

echo "✅ Migration marked as applied"

# Now run any pending migrations
echo "Running remaining migrations..."
npx prisma migrate deploy

echo "✅ All migrations applied successfully"
```

Then run it in your backend container:
```bash
# SSH into running backend container
aws ecs execute-command \
  --cluster parlae-cluster \
  --task <task-id> \
  --container backend \
  --command "/bin/sh" \
  --interactive

# Inside container:
cd /app/packages/prisma
npx prisma migrate resolve --applied 20260209000000_add_vapi_phone_numbers
npx prisma migrate deploy
exit
```

### Option 3: Update Startup Script

Update your `migrate-and-start.sh` to handle this automatically:

```bash
#!/bin/bash
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗄️  Running Database Migrations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd /app/packages/prisma

echo "Running prisma migrate deploy.."

# Try to run migrations
if ! npx prisma migrate deploy; then
  echo "⚠️  Migration failed. Checking for state issues..."
  
  # Check if it's the vapi_phone_numbers issue
  if npx prisma migrate status | grep -q "20260209000000_add_vapi_phone_numbers"; then
    echo "🔧 Detected state mismatch for 20260209000000_add_vapi_phone_numbers"
    echo "   Marking as applied..."
    npx prisma migrate resolve --applied 20260209000000_add_vapi_phone_numbers
    
    echo "🔄 Retrying migrations..."
    npx prisma migrate deploy
  else
    echo "❌ Unknown migration error. Exiting."
    exit 1
  fi
fi

echo "✅ Migrations complete"

# Start the application
cd /app/apps/backend
node dist/main.js
```

## Manual Database Fix (Last Resort)

If the above doesn't work, manually update the migration history:

**Step 1**: Connect to database
```bash
psql "postgresql://user:password@parlae-aurora-cluster.cluster-cpe42k4icbjd.us-east-2.rds.amazonaws.com:5432/dentia"
```

**Step 2**: Check migration history
```sql
SELECT * FROM _prisma_migrations 
WHERE migration_name = '20260209000000_add_vapi_phone_numbers';
```

**Step 3**: If not found, insert it manually
```sql
INSERT INTO _prisma_migrations (
  id,
  checksum,
  finished_at,
  migration_name,
  logs,
  rolled_back_at,
  started_at,
  applied_steps_count
) VALUES (
  gen_random_uuid()::text,
  'checksum-here',  -- Get from migration file
  NOW(),
  '20260209000000_add_vapi_phone_numbers',
  NULL,
  NULL,
  NOW(),
  1
);
```

**Step 4**: Verify
```sql
SELECT * FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;
```

## Immediate Fix for Production

**Quick SSH into running container and fix**:

```bash
# Get running task ID
TASK_ID=$(aws ecs list-tasks \
  --cluster parlae-cluster \
  --service-name parlae-backend \
  --region us-east-2 \
  --query 'taskArns[0]' \
  --output text | cut -d'/' -f3)

echo "Task ID: $TASK_ID"

# Connect to container
aws ecs execute-command \
  --cluster parlae-cluster \
  --task $TASK_ID \
  --container backend \
  --command "/bin/sh" \
  --interactive \
  --region us-east-2
```

**Inside the container**:
```bash
# Set the database URL (should already be set)
cd /app/packages/prisma

# Mark migration as applied
npx prisma migrate resolve --applied 20260209000000_add_vapi_phone_numbers

# Run remaining migrations
npx prisma migrate deploy

# Exit
exit
```

Then restart the backend service to ensure clean state:
```bash
aws ecs update-service \
  --cluster parlae-cluster \
  --service parlae-backend \
  --force-new-deployment \
  --region us-east-2
```

## Prevention: Best Practices

### 1. Never Create Tables Manually in Production
Always use Prisma migrations:
```bash
# Development
npx prisma migrate dev --name add_new_feature

# Production (automatic via deploy)
npx prisma migrate deploy
```

### 2. Test Migrations in Staging First
- Have a staging database that mirrors production
- Test migrations there before deploying to production
- Verify migration history matches

### 3. Backup Before Major Migrations
```bash
# Backup production database
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier parlae-backup-$(date +%Y%m%d-%H%M%S) \
  --db-cluster-identifier parlae-aurora-cluster
```

### 4. Monitor Migration Status
Add health check endpoint:
```typescript
// apps/backend/src/health/health.controller.ts
@Get('migrations')
async checkMigrations() {
  const result = await this.prisma.$queryRaw`
    SELECT migration_name, finished_at 
    FROM _prisma_migrations 
    ORDER BY finished_at DESC 
    LIMIT 10
  `;
  return result;
}
```

### 5. Use Migration Locks
Ensure only one deployment runs migrations at a time:
- Use ECS task count = 1 during deployment
- Or use advisory locks in PostgreSQL

## Verification Steps

After fixing, verify everything is correct:

```bash
# 1. Check migration status
npx prisma migrate status

# Expected output:
# Database schema is up to date!

# 2. Verify table exists
npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM vapi_phone_numbers;"

# 3. Check migration history
npx prisma db execute --stdin <<< "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 10;"

# 4. Generate Prisma Client (should work without errors)
npx prisma generate
```

## If You Need to Start Fresh (DANGEROUS)

**⚠️ WARNING: This will reset your migration history. Only use if absolutely necessary.**

```bash
# 1. Mark all failed migrations as rolled back
npx prisma migrate resolve --rolled-back 20260209000000_add_vapi_phone_numbers

# 2. Reset migration history (keeps data)
npx prisma migrate resolve --applied <migration-name>  # for each old migration

# 3. Or baseline from current schema (nuclear option)
# This marks current database state as the baseline
# npx prisma migrate resolve --applied 20260209000000_add_vapi_phone_numbers
```

## Related Commands

```bash
# Check migration status
npx prisma migrate status

# List all migrations
npx prisma migrate status --schema=packages/prisma/schema.prisma

# Mark migration as applied (use this one!)
npx prisma migrate resolve --applied <migration-name>

# Mark migration as rolled back
npx prisma migrate resolve --rolled-back <migration-name>

# Deploy pending migrations
npx prisma migrate deploy
```

## Getting Help

If issues persist:
1. Check Prisma docs: https://pris.ly/d/migrate-resolve
2. Review migration file: `packages/prisma/migrations/20260209000000_add_vapi_phone_numbers/migration.sql`
3. Check database state vs schema mismatch
4. Contact DevOps if database access needed
