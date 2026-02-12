#!/bin/bash
# Diagnostic: Check why migrations aren't running in production

cd /Users/shaunk/Projects/Parlae-AI/parlae

echo "🔍 Diagnosing migration issue..."
echo ""

# 1. Check if migrate-and-start.sh is in the Docker image
echo "1️⃣ Checking if migrate-and-start.sh exists in deployed image..."
echo ""
echo "   To verify: SSH into ECS task and run:"
echo "   ls -la /app/migrate-and-start.sh"
echo "   cat /app/migrate-and-start.sh | head -10"
echo ""

# 2. Check if migrations folder exists in image
echo "2️⃣ Checking if migrations are copied to image..."
echo ""
echo "   To verify: SSH into ECS task and run:"
echo "   ls -la /app/packages/prisma/migrations/"
echo ""

# 3. Check ECS task definition for entrypoint override
echo "3️⃣ Checking if ECS task definition overrides ENTRYPOINT..."
echo ""
TASK_DEF=$(aws ecs describe-services \
  --cluster parlae-cluster \
  --services parlae-frontend \
  --region us-east-2 \
  --profile parlae \
  --query 'services[0].taskDefinition' \
  --output text)

echo "   Current task definition: $TASK_DEF"
echo ""

ENTRYPOINT=$(aws ecs describe-task-definition \
  --task-definition "$TASK_DEF" \
  --region us-east-2 \
  --profile parlae \
  --query 'taskDefinition.containerDefinitions[0].entryPoint' \
  --output json)

COMMAND=$(aws ecs describe-task-definition \
  --task-definition "$TASK_DEF" \
  --region us-east-2 \
  --profile parlae \
  --query 'taskDefinition.containerDefinitions[0].command' \
  --output json)

echo "   ENTRYPOINT: $ENTRYPOINT"
echo "   COMMAND: $COMMAND"
echo ""

if [ "$ENTRYPOINT" = "null" ] || [ "$ENTRYPOINT" = "[]" ]; then
  echo "   ⚠️  No entrypoint override - using Dockerfile ENTRYPOINT ✅"
else
  echo "   ⚠️  ECS task definition has custom ENTRYPOINT!"
  echo "   This may bypass the migrate-and-start.sh script!"
fi

echo ""
echo "4️⃣ Checking latest ECS container startup logs..."
echo ""
echo "   Looking for migration output in logs..."
echo ""

# Get task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster parlae-cluster \
  --service-name parlae-frontend \
  --region us-east-2 \
  --profile parlae \
  --query 'taskArns[0]' \
  --output text)

if [ "$TASK_ARN" != "None" ] && [ -n "$TASK_ARN" ]; then
  echo "   Latest task: $TASK_ARN"
  echo ""
  echo "   To see full logs, run:"
  echo "   aws logs tail /ecs/parlae-frontend --since 5m --region us-east-2 --profile parlae"
else
  echo "   ❌ Could not find running task"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Most Likely Causes:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. ECS task definition overrides ENTRYPOINT (bypasses migrate script)"
echo "2. Migrations folder not copied to Docker image"
echo "3. migrate-and-start.sh fails silently and falls through"
echo "4. DATABASE_URL not set in container"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
