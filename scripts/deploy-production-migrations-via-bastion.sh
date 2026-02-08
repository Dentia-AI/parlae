#!/bin/bash

# Deploy Migrations to Production Database via Bastion Port Forwarding
# 
# Prerequisites:
# 1. Port forwarding must be active (run ./scripts/connect-production-db.sh in another terminal)
# 2. AWS CLI configured with dentia profile
# 3. Prisma CLI available (pnpm/npx)

set -e

PROFILE="dentia"
REGION="us-east-2"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗄️  Deploy Production Migrations via Bastion"
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
  --name "/dentia/backend/DATABASE_URL" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --profile $PROFILE \
  --region $REGION 2>&1)

if [ $? -ne 0 ]; then
  echo "❌ Failed to fetch DATABASE_URL from SSM"
  echo ""
  echo "Error: $DATABASE_URL"
  echo ""
  echo "Please ensure:"
  echo "  1. AWS CLI is configured with 'dentia' profile"
  echo "  2. You have permissions to access SSM parameters"
  echo "  3. Parameter /dentia/backend/DATABASE_URL exists"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL is empty"
  exit 1
fi

echo "✅ DATABASE_URL fetched from SSM"
echo ""

# Replace Aurora hostname with localhost:15432
DATABASE_URL_LOCAL=$(echo "$DATABASE_URL" | sed 's|dentia-aurora-cluster.cluster-c9kuy2skoi93.us-east-2.rds.amazonaws.com:5432|localhost:15432|')

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Migration Status Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd packages/prisma

echo "Running: npx prisma migrate status"
echo ""
DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate status || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Deploying Migrations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Running: npx prisma migrate deploy"
echo ""

if DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate deploy; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Migrations Deployed Successfully!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  echo "📊 Final Migration Status:"
  echo ""
  DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate status
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎉 Production Database Updated!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
else
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ Migration Deployment Failed!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Please check the error message above."
  echo ""
  exit 1
fi

cd ../..

