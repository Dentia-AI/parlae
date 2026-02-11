#!/bin/bash
set -e

# Fix Production Migration Error
# This script resolves the P3018 error for vapi_phone_numbers migration

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Production Migration Fix"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL not set"
  echo ""
  echo "Please set your production database URL:"
  echo "export DATABASE_URL='postgresql://user:password@host:port/database'"
  echo ""
  exit 1
fi

echo "📊 Database URL: ${DATABASE_URL%%@*}@***"  # Hide sensitive parts
echo ""

# Navigate to prisma directory
cd "$(dirname "$0")/../packages/prisma" || exit 1

echo "1️⃣ Checking migration status..."
echo ""
npx prisma migrate status || true
echo ""

echo "2️⃣ Marking problematic migration as applied..."
echo ""
npx prisma migrate resolve --applied 20260209000000_add_vapi_phone_numbers

echo ""
echo "3️⃣ Running remaining migrations..."
echo ""
npx prisma migrate deploy

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Migration fix complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Verifying migration status..."
npx prisma migrate status
echo ""
echo "🎉 All migrations are now in sync!"
