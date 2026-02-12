#!/bin/bash
# Check which migrations Prisma thinks are applied vs what's actually in the database

echo "🔍 Checking migration status mismatch..."
echo ""

echo "Migrations in the Docker image (from logs):"
echo "  Found: 19 migrations"
echo "  Status: No pending migrations to apply"
echo ""

echo "But the database is missing columns from these migrations:"
echo "  ❌ accounts.phone_integration_method (from migration: 20260212000000_add_phone_integration_fields or similar)"
echo "  ❌ call_logs.outcome (from migration: 20260211000000_add_call_analytics_and_outbound)"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Possible Causes:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Migrations marked as applied but failed to execute"
echo "   - _prisma_migrations table has the record"
echo "   - But the actual SQL didn't run or failed"
echo ""
echo "2. Schema drift from manual database changes"
echo "   - Someone ran ALTER TABLE manually"
echo "   - Prisma migrate status got out of sync"
echo ""
echo "3. Migration folder not fully copied to Docker image"
echo "   - Some migration folders missing"
echo "   - Docker image has 19 but should have more"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Solutions:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Option 1: Mark migrations as failed and re-run"
echo "  - Requires DB access to update _prisma_migrations table"
echo ""
echo "Option 2: Create a consolidated 'fix' migration"
echo "  - Add all missing columns in a new migration"
echo "  - Use IF NOT EXISTS to make it idempotent"
echo ""
echo "Option 3: Use prisma db push in production (NOT RECOMMENDED)"
echo "  - Forces schema sync"
echo "  - Loses migration history"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Recommended Approach:"
echo ""
echo "Let's count migrations in your local repo vs Docker image:"

cd /Users/shaunk/Projects/Parlae-AI/parlae/packages/prisma/migrations
LOCAL_COUNT=$(ls -1 | grep "^202" | wc -l | tr -d ' ')
echo "  Local migrations: $LOCAL_COUNT"
echo "  Docker image has: 19"
echo ""

if [ "$LOCAL_COUNT" -gt 19 ]; then
  echo "✅ You have newer migrations locally that aren't in the deployed image!"
  echo "   Solution: Commit and deploy to apply them"
else
  echo "⚠️  Same number of migrations - they're marked as applied but didn't actually run"
  echo "   Solution: Create a 'fix' migration that adds missing columns with IF NOT EXISTS"
fi
