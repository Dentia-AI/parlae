#!/bin/bash
set -e

echo "🔐 Adding Vapi secrets to frontend ECS task definition..."

# Get current task definition
TASK_DEF=$(aws ecs describe-task-definition \
  --task-definition parlae-frontend \
  --region us-east-2 \
  --profile parlae \
  --query 'taskDefinition' \
  --output json)

# Extract current secrets
CURRENT_SECRETS=$(echo "$TASK_DEF" | jq -r '.containerDefinitions[0].secrets')

# Add Vapi secrets (checking if they don't already exist)
NEW_SECRETS=$(echo "$CURRENT_SECRETS" | jq '. + [
  {
    "name": "VAPI_API_KEY",
    "valueFrom": "/parlae/frontend/VAPI_API_KEY"
  },
  {
    "name": "NEXT_PUBLIC_VAPI_PUBLIC_KEY",
    "valueFrom": "/parlae/frontend/NEXT_PUBLIC_VAPI_PUBLIC_KEY"
  },
  {
    "name": "VAPI_SERVER_SECRET",
    "valueFrom": "/parlae/frontend/VAPI_SERVER_SECRET"
  },
  {
    "name": "ELEVENLABS_API_KEY",
    "valueFrom": "/parlae/frontend/ELEVENLABS_API_KEY"
  },
  {
    "name": "OPENAI_API_KEY",
    "valueFrom": "/parlae/frontend/OPENAI_API_KEY"
  },
  {
    "name": "TWILIO_ACCOUNT_SID",
    "valueFrom": "/parlae/frontend/TWILIO_ACCOUNT_SID"
  },
  {
    "name": "TWILIO_AUTH_TOKEN",
    "valueFrom": "/parlae/frontend/TWILIO_AUTH_TOKEN"
  }
] | unique_by(.name)')

# Create new task definition with Vapi secrets
NEW_TASK_DEF=$(echo "$TASK_DEF" | jq --argjson secrets "$NEW_SECRETS" '
  .containerDefinitions[0].secrets = $secrets |
  del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)
')

# Register new task definition
echo "📝 Registering new task definition..."
NEW_REVISION=$(aws ecs register-task-definition \
  --cli-input-json "$NEW_TASK_DEF" \
  --region us-east-2 \
  --profile parlae \
  --query 'taskDefinition.revision' \
  --output text)

echo "✅ New task definition registered: parlae-frontend:$NEW_REVISION"

# Update service to use new task definition
echo "🔄 Updating frontend service..."
aws ecs update-service \
  --cluster parlae-cluster \
  --service parlae-frontend \
  --task-definition parlae-frontend:$NEW_REVISION \
  --force-new-deployment \
  --region us-east-2 \
  --profile parlae \
  --query 'service.{name:serviceName,status:status,desiredCount:desiredCount}' \
  --output table

echo ""
echo "✅ Frontend service updated with all secrets!"
echo ""
echo "New secrets added:"
echo "  - VAPI_API_KEY"
echo "  - NEXT_PUBLIC_VAPI_PUBLIC_KEY"
echo "  - VAPI_SERVER_SECRET"
echo "  - ELEVENLABS_API_KEY"
echo "  - OPENAI_API_KEY"
echo "  - TWILIO_ACCOUNT_SID"
echo "  - TWILIO_AUTH_TOKEN"
echo ""
echo "Wait 2-3 minutes for new tasks to start, then test file upload at:"
echo "https://app.parlae.ca"
