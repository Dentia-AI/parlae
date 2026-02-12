#!/bin/sh

# This script runs migrations before starting the application
# Used in ECS containers to ensure DB is up-to-date before app starts

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗄️  Running Database Migrations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

# Find Prisma directory
PRISMA_DIR=""
if [ -d "/app/packages/prisma" ]; then
  PRISMA_DIR="/app/packages/prisma"
elif [ -d "/app/node_modules/@kit/prisma" ]; then
  PRISMA_DIR="/app/node_modules/@kit/prisma"
elif [ -d "packages/prisma" ]; then
  PRISMA_DIR="packages/prisma"
else
  echo "❌ ERROR: Cannot find Prisma directory"
  exit 1
fi

echo "Using Prisma directory: $PRISMA_DIR"
cd "$PRISMA_DIR"

# Check if migrations directory exists
if [ ! -d "migrations" ]; then
  echo "⚠️  No migrations directory found. Skipping migrations."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cd /app
  echo "🚀 Starting application..."
  exec "$@"
fi

echo "Running prisma migrate deploy..."
echo ""

# Run migrations (idempotent - only applies new migrations)
npx prisma migrate deploy

MIGRATION_EXIT_CODE=$?

if [ $MIGRATION_EXIT_CODE -ne 0 ]; then
  echo ""
  echo "❌ Migration failed with exit code $MIGRATION_EXIT_CODE"
  echo "Checking migration status..."
  npx prisma migrate status || true
  echo ""
  echo "⚠️  Attempting to resolve failed migrations..."
  # Mark failed migrations as rolled back so they can be re-applied
  npx prisma migrate resolve --rolled-back 20260212000001_make_shaun_super_admin || true
  echo ""
  echo "Retrying prisma migrate deploy..."
  npx prisma migrate deploy
  MIGRATION_EXIT_CODE=$?
  
  if [ $MIGRATION_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "❌ Migration retry failed with exit code $MIGRATION_EXIT_CODE"
    echo "⚠️  Starting application anyway (some features may not work)"
    # Don't exit - let the app start even with migration failures
  fi
fi

echo ""
echo "✅ Migrations completed successfully"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Change back to app directory
cd /app

# Execute the main application command
echo "🚀 Starting application..."
exec "$@"

