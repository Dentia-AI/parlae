#!/bin/bash

# Fix Production Migration Error via Bastion Port Forwarding
# 
# This script fixes the P3018 migration error:
# "relation vapi_phone_numbers already exists"
#
# Prerequisites:
# 1. Port forwarding must be active (run ./scripts/connect-production-db.sh in another terminal)
# 2. AWS CLI configured with parlae profile

set -e

PROFILE="parlae"
REGION="us-east-2"
MIGRATION_NAME="20260209000000_add_vapi_phone_numbers"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Fix Production Migration Error"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Must run from project root"
  exit 1
fi

# Check if port forwarding is active
echo "🔍 Checking if port forwarding is active..."
if ! lsof -i :15432 > /dev/null 2>&1; then
  echo "❌ Port 15432 is not listening"
  echo ""
  echo "📋 Please start port forwarding first:"
  echo "   1. Open a new terminal"
  echo "   2. Run: ./scripts/connect-production-db.sh"
  echo "   3. Keep that terminal open"
  echo "   4. Come back here and run this script again"
  echo ""
  exit 1
fi

echo "✅ Port forwarding is active"
echo ""

# Fetch DATABASE_URL from AWS SSM
echo "🔍 Fetching DATABASE_URL from AWS SSM..."
DATABASE_URL=$(aws ssm get-parameter \
  --name "/parlae/backend/DATABASE_URL" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --profile $PROFILE \
  --region $REGION 2>&1)

if [ $? -ne 0 ]; then
  echo "❌ Failed to fetch DATABASE_URL from SSM"
  echo ""
  echo "Error: $DATABASE_URL"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL is empty"
  exit 1
fi

echo "✅ DATABASE_URL fetched from SSM"
echo ""

# Replace Aurora hostname with localhost:15432
DATABASE_URL_LOCAL=$(echo "$DATABASE_URL" | sed 's|parlae-aurora-cluster.cluster-cpe42k4icbjd.us-east-2.rds.amazonaws.com:5432|localhost:15432|')

cd packages/prisma

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Current Migration Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate status || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Marking Migration as Applied"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Migration: $MIGRATION_NAME"
echo ""
echo "This tells Prisma that the migration has already been applied"
echo "without actually running the SQL (which would fail since the"
echo "table already exists)."
echo ""

if DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate resolve --applied "$MIGRATION_NAME"; then
  echo ""
  echo "✅ Migration marked as applied"
  echo ""
else
  echo ""
  echo "❌ Failed to mark migration as applied"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Running Remaining Migrations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate deploy; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ All Migrations Applied Successfully!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  echo "📊 Final Migration Status:"
  echo ""
  DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate status
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎉 Production Database Fixed!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Next Steps:"
  echo "  1. Stop the port forwarding (Ctrl+C in the other terminal)"
  echo "  2. Restart your backend service to clear the error:"
  echo "     aws ecs update-service \\"
  echo "       --cluster parlae-cluster \\"
  echo "       --service parlae-backend \\"
  echo "       --force-new-deployment \\"
  echo "       --region us-east-2 \\"
  echo "       --profile parlae"
  echo ""
else
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ Migration Deployment Failed!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  exit 1
fi

cd ../..
