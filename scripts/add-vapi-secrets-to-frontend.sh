#!/bin/bash
set -e

echo "🔐 Adding Vapi secrets to AWS SSM Parameter Store for frontend..."

# Check if VAPI_API_KEY is provided
if [ -z "$VAPI_API_KEY" ]; then
  echo "❌ Error: VAPI_API_KEY environment variable not set"
  echo "Usage: VAPI_API_KEY=your_key NEXT_PUBLIC_VAPI_PUBLIC_KEY=your_public_key VAPI_SERVER_SECRET=your_secret ./add-vapi-secrets-to-frontend.sh"
  exit 1
fi

if [ -z "$NEXT_PUBLIC_VAPI_PUBLIC_KEY" ]; then
  echo "❌ Error: NEXT_PUBLIC_VAPI_PUBLIC_KEY environment variable not set"
  exit 1
fi

if [ -z "$VAPI_SERVER_SECRET" ]; then
  echo "❌ Error: VAPI_SERVER_SECRET environment variable not set"
  exit 1
fi

# Add VAPI_API_KEY
echo "📝 Adding VAPI_API_KEY to SSM..."
aws ssm put-parameter \
  --name "/parlae/frontend/VAPI_API_KEY" \
  --value "$VAPI_API_KEY" \
  --type "SecureString" \
  --region us-east-2 \
  --profile parlae \
  --overwrite

# Add NEXT_PUBLIC_VAPI_PUBLIC_KEY
echo "📝 Adding NEXT_PUBLIC_VAPI_PUBLIC_KEY to SSM..."
aws ssm put-parameter \
  --name "/parlae/frontend/NEXT_PUBLIC_VAPI_PUBLIC_KEY" \
  --value "$NEXT_PUBLIC_VAPI_PUBLIC_KEY" \
  --type "SecureString" \
  --region us-east-2 \
  --profile parlae \
  --overwrite

# Add VAPI_SERVER_SECRET
echo "📝 Adding VAPI_SERVER_SECRET to SSM..."
aws ssm put-parameter \
  --name "/parlae/frontend/VAPI_SERVER_SECRET" \
  --value "$VAPI_SERVER_SECRET" \
  --type "SecureString" \
  --region us-east-2 \
  --profile parlae \
  --overwrite

echo ""
echo "✅ All frontend Vapi secrets added to SSM Parameter Store!"
echo ""
echo "Now force a new deployment of the frontend service:"
echo "aws ecs update-service --cluster parlae-cluster --service parlae-frontend --force-new-deployment --region us-east-2 --profile parlae"
