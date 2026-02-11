#!/bin/bash

# Connect to Production Database via Bastion Host
# This establishes a port forwarding tunnel through AWS Systems Manager

set -e

PROFILE="parlae"
REGION="us-east-2"

echo "🔍 Finding bastion instance..."
BASTION_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=parlae-bastion" \
           "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text \
  --profile $PROFILE \
  --region $REGION)

if [ -z "$BASTION_ID" ] || [ "$BASTION_ID" = "None" ]; then
  echo "❌ Bastion instance not found or not running"
  echo ""
  echo "Check instance status:"
  echo "  aws ec2 describe-instances \\"
  echo "    --filters \"Name=tag:Name,Values=dentia-bastion\" \\"
  echo "    --query \"Reservations[*].Instances[*].[InstanceId,State.Name]\" \\"
  echo "    --output table \\"
  echo "    --profile $PROFILE \\"
  echo "    --region $REGION"
  exit 1
fi

echo "✅ Found bastion: $BASTION_ID"
echo ""
echo "🚀 Starting port forwarding session..."
echo ""
echo "   📍 Connection Details:"
echo "   ├─ Local port:  15432"
echo "   ├─ Remote host: parlae-aurora-cluster.cluster-cpe42k4icbjd.us-east-2.rds.amazonaws.com"
echo "   └─ Remote port: 5432"
echo ""
echo "💡 Tips:"
echo "   • Keep this terminal open while using the connection"
echo "   • Open a new terminal to run migrations or connect via psql"
echo "   • Press Ctrl+C to close the connection"
echo ""
echo "📚 Usage Examples:"
echo ""
echo "   # Deploy migrations (in another terminal):"
echo "   ./scripts/deploy-production-migrations-via-bastion.sh"
echo ""
echo "   # Connect via psql:"
echo "   psql postgresql://USER:PASS@localhost:15432/dentia"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

aws ssm start-session \
  --target $BASTION_ID \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{
    "host":["parlae-aurora-cluster.cluster-cpe42k4icbjd.us-east-2.rds.amazonaws.com"],
    "portNumber":["5432"],
    "localPortNumber":["15432"]
  }' \
  --profile $PROFILE \
  --region $REGION

