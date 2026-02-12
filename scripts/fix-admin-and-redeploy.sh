#!/bin/bash
# Add ADMIN_USER_IDS to ECS task definition and redeploy

set -e

echo "📝 Adding ADMIN_USER_IDS to ECS task definition"
echo "=============================================="

# Get current frontend task definition
echo "Fetching current frontend task definition..."
TASK_DEF=$(aws ecs describe-task-definition \
  --task-definition parlae-frontend \
  --region us-east-2 \
  --profile parlae \
  --query 'taskDefinition' \
  --output json)

# Add ADMIN_USER_IDS to secrets
echo "Adding ADMIN_USER_IDS environment variable..."

UPDATED_TASK_DEF=$(echo "$TASK_DEF" | jq '
  .containerDefinitions[0].secrets += [
    {
      "name": "ADMIN_USER_IDS",
      "valueFrom": "/parlae/frontend/ADMIN_USER_IDS"
    }
  ] |
  # Remove fields that are not allowed in register-task-definition
  del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)
')

# Register the new task definition
echo "Registering new task definition..."
TEMP_FILE=$(mktemp)
echo "$UPDATED_TASK_DEF" > "$TEMP_FILE"
NEW_TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json "file://$TEMP_FILE" \
  --region us-east-2 \
  --profile parlae \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)
rm "$TEMP_FILE"

echo "✅ New task definition registered: $NEW_TASK_DEF_ARN"

# Update the frontend service
echo "Updating frontend service..."
aws ecs update-service \
  --cluster parlae-cluster \
  --service parlae-frontend \
  --task-definition "$NEW_TASK_DEF_ARN" \
  --force-new-deployment \
  --region us-east-2 \
  --profile parlae \
  --output json > /dev/null

echo "✅ Frontend service updated"
echo ""
echo "🎉 Done! Waiting for new container to start..."
echo ""
echo "This deployment will:"
echo "  1. Add ADMIN_USER_IDS for admin access"
echo "  2. Apply any pending database migrations"
echo ""
echo "Wait ~3 minutes, then:"
echo "  - Visit https://app.parlae.ca/admin (admin access)"
echo "  - Visit https://app.parlae.ca/home (dashboard should work)"
