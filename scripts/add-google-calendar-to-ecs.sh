#!/bin/bash
# Add Google Calendar credentials to ECS task definition

set -e

echo "📝 Adding Google Calendar credentials to ECS task definitions"
echo "=============================================================="

# Get current frontend task definition
echo "Fetching current frontend task definition..."
TASK_DEF=$(aws ecs describe-task-definition \
  --task-definition parlae-frontend \
  --region us-east-2 \
  --profile parlae \
  --query 'taskDefinition' \
  --output json)

# Extract the containerDefinitions and add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
echo "Adding Google Calendar environment variables..."

# Use jq to add the new secrets to the first container
UPDATED_TASK_DEF=$(echo "$TASK_DEF" | jq '
  .containerDefinitions[0].secrets += [
    {
      "name": "GOOGLE_CLIENT_ID",
      "valueFrom": "/parlae/frontend/GOOGLE_CLIENT_ID"
    },
    {
      "name": "GOOGLE_CLIENT_SECRET",
      "valueFrom": "/parlae/frontend/GOOGLE_CLIENT_SECRET"
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

echo "✅ New frontend task definition registered: $NEW_TASK_DEF_ARN"

# Update the frontend service to use the new task definition
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
echo "🎉 Done! Google Calendar credentials will be available after containers restart (~2 minutes)"
echo ""
echo "To verify, wait 2 minutes then try connecting Google Calendar at:"
echo "https://app.parlae.ca/home/agent/setup/integrations"
