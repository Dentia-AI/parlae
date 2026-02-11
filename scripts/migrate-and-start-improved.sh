#!/bin/sh

# Enhanced migration script with error recovery
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

# Try to run migrations
MIGRATION_OUTPUT=$(npx prisma migrate deploy 2>&1) || MIGRATION_EXIT_CODE=$?

# Check if migration succeeded
if [ ${MIGRATION_EXIT_CODE:-0} -eq 0 ]; then
  echo "$MIGRATION_OUTPUT"
  echo ""
  echo "✅ Migrations completed successfully"
else
  echo "$MIGRATION_OUTPUT"
  echo ""
  echo "⚠️  Migration failed. Attempting automatic recovery..."
  
  # Check if it's the P3018 error (relation already exists)
  if echo "$MIGRATION_OUTPUT" | grep -q "P3018"; then
    echo "   Detected P3018 error (migration state mismatch)"
    
    # Extract the problematic migration name
    FAILED_MIGRATION=$(echo "$MIGRATION_OUTPUT" | grep "Migration name:" | sed 's/Migration name: //' | tr -d '[:space:]')
    
    if [ -n "$FAILED_MIGRATION" ]; then
      echo "   Failed migration: $FAILED_MIGRATION"
      echo "   Marking migration as applied..."
      
      npx prisma migrate resolve --applied "$FAILED_MIGRATION"
      
      echo "   Retrying migrations..."
      npx prisma migrate deploy
      
      echo ""
      echo "✅ Recovery successful! Migrations completed."
    else
      echo "   ❌ Could not extract migration name. Manual intervention required."
      echo ""
      echo "To fix manually, run:"
      echo "  npx prisma migrate status"
      echo "  npx prisma migrate resolve --applied <migration-name>"
      exit 1
    fi
  else
    echo "   ❌ Unknown migration error. Manual intervention required."
    echo ""
    echo "Migration output:"
    echo "$MIGRATION_OUTPUT"
    echo ""
    echo "To diagnose:"
    echo "  1. Check migration logs above"
    echo "  2. Run: npx prisma migrate status"
    echo "  3. See docs/MIGRATION_ERROR_FIX.md"
    exit $MIGRATION_EXIT_CODE
  fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Change back to app directory
cd /app

# Execute the main application command
echo "🚀 Starting application..."
exec "$@"
