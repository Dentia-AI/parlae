# 🚨 QUICK FIX: Production Migration Error

## Your Error
```
Error: P3018
relation "vapi_phone_numbers" already exists
Migration name: 20260209000000_add_vapi_phone_numbers
```

## Immediate Fix (Choose One)

### Option 1: Fix via AWS CLI (Fastest)

```bash
# 1. Get your running backend task ID
TASK_ID=$(aws ecs list-tasks \
  --cluster parlae-cluster \
  --service-name parlae-backend \
  --region us-east-2 \
  --query 'taskArns[0]' \
  --output text | cut -d'/' -f3)

# 2. Connect to the container
aws ecs execute-command \
  --cluster parlae-cluster \
  --task $TASK_ID \
  --container backend \
  --command "/bin/sh" \
  --interactive \
  --region us-east-2
```

**Inside the container, run**:
```bash
cd /app/packages/prisma
npx prisma migrate resolve --applied 20260209000000_add_vapi_phone_numbers
npx prisma migrate deploy
exit
```

**Then restart the service**:
```bash
aws ecs update-service \
  --cluster parlae-cluster \
  --service parlae-backend \
  --force-new-deployment \
  --region us-east-2
```

### Option 2: Fix from Local Machine

```bash
# 1. Set production database URL
export DATABASE_URL="postgresql://user:password@parlae-aurora-cluster.cluster-cpe42k4icbjd.us-east-2.rds.amazonaws.com:5432/dentia"

# 2. Run the fix script
./scripts/fix-production-migration.sh
```

### Option 3: Manual SQL Fix

If you have direct database access:

```sql
-- Connect to database
psql "$DATABASE_URL"

-- Insert the migration record
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
  '8d7e3e2f4a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d',
  NOW(),
  '20260209000000_add_vapi_phone_numbers',
  NULL,
  NULL,
  NOW(),
  1
);

-- Verify
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;
```

## What This Does

This tells Prisma: "Yes, this migration has already been applied" without trying to create the table again (which would fail since it already exists).

## After the Fix

Your backend should start successfully. Monitor it:

```bash
# Watch logs
aws logs tail /aws/ecs/parlae-backend --follow --region us-east-2

# Check service health
aws ecs describe-services \
  --cluster parlae-cluster \
  --services parlae-backend \
  --region us-east-2
```

## Prevention for Future

Use the improved startup script in your Docker container:
- Update `infra/docker/backend.Dockerfile` to use `migrate-and-start-improved.sh`
- This script auto-detects and fixes this type of error

See `docs/MIGRATION_ERROR_FIX.md` for complete details.

## Need Help?

1. ✅ Check `docs/MIGRATION_ERROR_FIX.md` for detailed explanation
2. ✅ Review Prisma docs: https://pris.ly/d/migrate-resolve
3. ✅ Check CloudWatch logs for more details
