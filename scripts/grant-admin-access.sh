#!/bin/bash
# Grant admin access to a user by adding their ID to ADMIN_USER_IDS

set -e

EMAIL="${1:-shaun.everbridge@gmail.com}"

echo "🔍 Finding user ID for: $EMAIL"
echo "========================================"

# Get DATABASE_URL from SSM
DATABASE_URL=$(aws ssm get-parameter --name "/parlae/frontend/DATABASE_URL" --region us-east-2 --profile parlae --with-decryption --query 'Parameter.Value' --output text)

# Parse the DATABASE_URL (format: postgresql://user:pass@host:port/dbname?schema=public)
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p' | python3 -c "import sys; from urllib.parse import unquote; print(unquote(sys.stdin.read().strip()))")
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

# Query the user ID from the database
echo "Querying database..."
USER_ID=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT id FROM users WHERE email = '$EMAIL';" 2>/dev/null | tr -d ' \n')

if [ -z "$USER_ID" ]; then
  echo "❌ ERROR: User not found with email: $EMAIL"
  echo ""
  echo "Make sure you've signed up with this email at https://app.parlae.ca/auth/sign-up"
  exit 1
fi

echo "✅ Found user ID: $USER_ID"
echo ""
echo "📝 Setting ADMIN_USER_IDS in SSM Parameter Store..."

# Set the ADMIN_USER_IDS parameter
aws ssm put-parameter \
  --name "/parlae/frontend/ADMIN_USER_IDS" \
  --value "$USER_ID" \
  --type "String" \
  --overwrite \
  --region us-east-2 \
  --profile parlae \
  > /dev/null

echo "✅ ADMIN_USER_IDS set successfully"
echo ""
echo "🔄 Restarting frontend service to apply changes..."

# Restart frontend service
aws ecs update-service \
  --cluster parlae-cluster \
  --service parlae-frontend \
  --force-new-deployment \
  --region us-east-2 \
  --profile parlae \
  --output json > /dev/null

echo "✅ Service restarted"
echo ""
echo "🎉 Done! Admin access granted to: $EMAIL"
echo "   User ID: $USER_ID"
echo ""
echo "⏰ Wait ~2 minutes for the new container to start, then visit:"
echo "   https://app.parlae.ca/admin"
