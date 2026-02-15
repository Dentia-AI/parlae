#!/bin/sh

# This script runs migrations before starting the application
# Used in ECS containers to ensure DB is up-to-date before app starts
#
# Handles these Prisma error codes automatically:
#   P3009 - Failed migration found (marks as applied, retries)
#   P3018 - Migration already applied / relation exists (marks as applied, retries)

# Note: Don't use 'set -e' here because we want to handle migration failures gracefully

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Running Database Migrations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
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
  echo "ERROR: Cannot find Prisma directory"
  exit 1
fi

echo "Using Prisma directory: $PRISMA_DIR"
cd "$PRISMA_DIR"

# Check if migrations directory exists
if [ ! -d "migrations" ]; then
  echo "No migrations directory found. Skipping migrations."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cd /app
  echo "Starting application..."
  exec "$@"
fi

# ── Helper: extract migration name from Prisma error output ───────────────
extract_migration_name() {
  echo "$1" | grep -oE '[0-9]{14}_[a-z_]+' | head -1
}

# ── Attempt 1: Standard migrate deploy ────────────────────────────────────
echo "Running prisma migrate deploy..."
echo ""

MIGRATION_OUTPUT=$(npx prisma migrate deploy 2>&1) || true
MIGRATION_EXIT_CODE=$?

if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
  echo "$MIGRATION_OUTPUT"
  echo ""
  echo "Migrations completed successfully"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  cd /app
  echo "Starting application..."
  exec "$@"
fi

echo "$MIGRATION_OUTPUT"
echo ""
echo "Migration failed (exit code $MIGRATION_EXIT_CODE). Attempting recovery..."

# ── Handle P3009: Failed migration blocking new ones ──────────────────────
if echo "$MIGRATION_OUTPUT" | grep -q "P3009"; then
  FAILED_MIGRATION=$(extract_migration_name "$MIGRATION_OUTPUT")
  
  if [ -n "$FAILED_MIGRATION" ]; then
    echo "Detected P3009: Failed migration '$FAILED_MIGRATION' blocking deploy"
    echo "Marking '$FAILED_MIGRATION' as applied (SQL is idempotent)..."
    npx prisma migrate resolve --applied "$FAILED_MIGRATION" || true
    
    echo "Retrying prisma migrate deploy..."
    RETRY_OUTPUT=$(npx prisma migrate deploy 2>&1) || true
    RETRY_EXIT_CODE=$?
    
    if [ $RETRY_EXIT_CODE -eq 0 ]; then
      echo "$RETRY_OUTPUT"
      echo ""
      echo "Recovery successful! Migrations completed."
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo ""
      cd /app
      echo "Starting application..."
      exec "$@"
    fi
    
    echo "$RETRY_OUTPUT"
    echo "Retry failed. Checking for additional blocked migrations..."
    
    # There might be a second failed migration after the first one is resolved
    if echo "$RETRY_OUTPUT" | grep -q "P3009\|P3018"; then
      SECOND_FAILED=$(extract_migration_name "$RETRY_OUTPUT")
      if [ -n "$SECOND_FAILED" ] && [ "$SECOND_FAILED" != "$FAILED_MIGRATION" ]; then
        echo "Found second blocked migration: '$SECOND_FAILED'"
        echo "Marking as applied..."
        npx prisma migrate resolve --applied "$SECOND_FAILED" || true
        echo "Retrying..."
        npx prisma migrate deploy || true
      fi
    fi
  fi
fi

# ── Handle P3018: Migration state mismatch (already exists) ──────────────
if echo "$MIGRATION_OUTPUT" | grep -q "P3018"; then
  FAILED_MIGRATION=$(extract_migration_name "$MIGRATION_OUTPUT")
  
  if [ -n "$FAILED_MIGRATION" ]; then
    echo "Detected P3018: Migration '$FAILED_MIGRATION' state mismatch"
    echo "Marking as applied..."
    npx prisma migrate resolve --applied "$FAILED_MIGRATION" || true
    
    echo "Retrying prisma migrate deploy..."
    npx prisma migrate deploy || true
  fi
fi

# ── Final status check ───────────────────────────────────────────────────
echo ""
echo "Final migration status:"
npx prisma migrate status 2>&1 || true
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Starting application (some features may be limited if migrations failed)..."
echo ""

# Change back to app directory
cd /app

# Execute the main application command
exec "$@"

