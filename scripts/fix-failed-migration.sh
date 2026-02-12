#!/bin/bash

# Quick fix script to resolve the failed migration in production
# This connects to the production database and marks the failed migration as rolled back

set -e

echo "🔧 Fixing Failed Migration in Production Database"
echo "=================================================="
echo ""

# Get DATABASE_URL from SSM
DATABASE_URL=$(aws ssm get-parameter --name "/parlae/frontend/DATABASE_URL" --region us-east-2 --profile parlae --with-decryption --query 'Parameter.Value' --output text)

# Parse the DATABASE_URL
# Format: postgresql://user:pass@host:port/dbname?schema=public
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p' | python3 -c "import sys; from urllib.parse import unquote; print(unquote(sys.stdin.read().strip()))")
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo "Connecting to: $DB_HOST:$DB_PORT/$DB_NAME as $DB_USER"
echo ""

# SQL to mark the failed migration as rolled back
SQL="UPDATE _prisma_migrations 
SET rolled_back_at = NOW(), 
    finished_at = NULL 
WHERE migration_name = '20260212000001_make_shaun_super_admin' 
  AND rolled_back_at IS NULL
RETURNING migration_name, started_at, rolled_back_at;"

echo "Marking failed migration as rolled back..."
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "$SQL"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ SUCCESS: Failed migration marked as rolled back"
  echo ""
  echo "Next steps:"
  echo "1. ECS containers will automatically retry the migration on next restart"
  echo "2. The corrected migration SQL will apply successfully"
  echo "3. Restart ECS services to apply the fix:"
  echo ""
  echo "   aws ecs update-service --cluster parlae-cluster --service parlae-frontend --force-new-deployment --region us-east-2 --profile parlae"
  echo "   aws ecs update-service --cluster parlae-cluster --service parlae-backend --force-new-deployment --region us-east-2 --profile parlae"
else
  echo ""
  echo "❌ ERROR: Failed to update migration status"
  exit 1
fi
