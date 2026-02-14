#!/bin/bash
set -e

echo "🔐 Adding Vapi secrets to backend ECS task definition..."

# Get current task definition
TASK_DEF=$(aws ecs describe-task-definition \
  --task-definition parlae-backend \
  --region us-east-2 \
  --profile parlae \
  --query 'taskDefinition' \
  --output json)

# Extract current secrets
CURRENT_SECRETS=$(echo "$TASK_DEF" | jq -r '.containerDefinitions[0].secrets')

# Add Vapi secrets
NEW_SECRETS=$(echo "$CURRENT_SECRETS" | jq '. + [
  {
    "name": "VAPI_WEBHOOK_SECRET",
    "valueFrom": "/parlae/backend/VAPI_WEBHOOK_SECRET"
  },
  {
    "name": "VAPI_SERVER_SECRET",
    "valueFrom": "/parlae/backend/VAPI_SERVER_SECRET"
  }
]')

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

echo "✅ New task definition registered: parlae-backend:$NEW_REVISION"

# Update service to use new task definition
echo "🔄 Updating backend service..."
aws ecs update-service \
  --cluster parlae-cluster \
  --service parlae-backend \
  --task-definition parlae-backend:$NEW_REVISION \
  --force-new-deployment \
  --region us-east-2 \
  --profile parlae \
  --query 'service.{name:serviceName,status:status,desiredCount:desiredCount}' \
  --output table

echo ""
echo "✅ Backend service updated with Vapi secrets!"
echo ""
echo "Wait 2-3 minutes for new tasks to start, then test:"
echo "curl -X POST https://api.parlae.ca/vapi/tools/get-patient-info \\"
echo "  -H 'x-vapi-signature: pP4FZg9HcijoYUkH7i1kjeKylF6Ov1cv2akrhJxD5vuTL3Ov67c2XQod8vsYq3OQ' \\"
echo "  -H 'Content-Type: application/json' -d '{...}'"
