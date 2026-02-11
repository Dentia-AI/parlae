#!/bin/bash

# All-in-one script to fix production migration
# This runs the bastion connection and migration fix

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Production Migration Fix - All-in-One"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This script will:"
echo "  1. Start bastion port forwarding in background"
echo "  2. Fix the migration error"
echo "  3. Close the connection"
echo ""

PROFILE="parlae"
REGION="us-east-2"

# Find bastion instance
echo "🔍 Finding bastion instance..."
BASTION_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=parlae-bastion" \
           "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text \
  --profile $PROFILE \
  --region $REGION)

if [ -z "$BASTION_ID" ] || [ "$BASTION_ID" = "None" ]; then
  echo "❌ Bastion instance not found"
  exit 1
fi

echo "✅ Found bastion: $BASTION_ID"
echo ""

# Start port forwarding in background
echo "🚀 Starting port forwarding..."
aws ssm start-session \
  --target $BASTION_ID \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{
    "host":["parlae-aurora-cluster.cluster-cpe42k4icbjd.us-east-2.rds.amazonaws.com"],
    "portNumber":["5432"],
    "localPortNumber":["15432"]
  }' \
  --profile $PROFILE \
  --region $REGION &

SSM_PID=$!
echo "✅ Port forwarding started (PID: $SSM_PID)"
echo ""

# Wait for port to be ready
echo "⏳ Waiting for port forwarding to be ready..."
sleep 5

# Check if port is listening
for i in {1..10}; do
  if lsof -i :15432 > /dev/null 2>&1; then
    echo "✅ Port forwarding is ready"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "❌ Port forwarding failed to start"
    kill $SSM_PID 2>/dev/null || true
    exit 1
  fi
  echo "   Waiting... ($i/10)"
  sleep 2
done

echo ""

# Fetch DATABASE_URL
echo "🔍 Fetching DATABASE_URL..."
DATABASE_URL=$(aws ssm get-parameter \
  --name "/parlae/backend/DATABASE_URL" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --profile $PROFILE \
  --region $REGION)

# Replace hostname with localhost
DATABASE_URL_LOCAL=$(echo "$DATABASE_URL" | sed 's|parlae-aurora-cluster.cluster-cpe42k4icbjd.us-east-2.rds.amazonaws.com:5432|localhost:15432|')

cd packages/prisma

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Fixing Migration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Mark migration as applied
echo "1️⃣ Marking migration as applied..."
if DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate resolve --applied 20260209000000_add_vapi_phone_numbers; then
  echo "   ✅ Migration marked as applied"
else
  echo "   ❌ Failed to mark migration"
  kill $SSM_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "2️⃣ Running remaining migrations..."
if DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate deploy; then
  echo "   ✅ All migrations applied"
else
  echo "   ❌ Migration deployment failed"
  kill $SSM_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "3️⃣ Verifying migration status..."
DATABASE_URL="$DATABASE_URL_LOCAL" npx prisma migrate status

cd ../..

# Clean up
echo ""
echo "🧹 Closing port forwarding..."
kill $SSM_PID 2>/dev/null || true
sleep 2

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Migration Fixed Successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next Steps:"
echo "  1. Restart your backend service:"
echo ""
echo "     aws ecs update-service \\"
echo "       --cluster parlae-cluster \\"
echo "       --service parlae-backend \\"
echo "       --force-new-deployment \\"
echo "       --region us-east-2 \\"
echo "       --profile parlae"
echo ""
echo "  2. Monitor the deployment:"
echo ""
echo "     aws logs tail /aws/ecs/parlae-backend --follow --region us-east-2 --profile parlae"
echo ""
