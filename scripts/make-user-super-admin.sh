#!/bin/bash
# Make a user super admin

EMAIL="${1:-shaun.everbridge@gmail.com}"

echo "🔧 Making user super admin: $EMAIL"
echo ""

# Get DATABASE_URL from SSM
DATABASE_URL=$(aws ssm get-parameter \
  --name "/parlae/frontend/DATABASE_URL" \
  --with-decryption \
  --region us-east-2 \
  --profile parlae \
  --query 'Parameter.Value' \
  --output text)

if [ -z "$DATABASE_URL" ]; then
  echo "❌ Failed to get DATABASE_URL from SSM"
  exit 1
fi

echo "✅ Got DATABASE_URL from SSM"
echo ""

# First, find the user's ID
echo "Looking up user..."
USER_ID=$(cd /Users/shaunk/Projects/Parlae-AI/parlae/packages/prisma && \
  DATABASE_URL="$DATABASE_URL" npx prisma db execute --stdin <<EOF | grep -o '[a-f0-9-]\{36\}'
SELECT id FROM users WHERE email = '$EMAIL' LIMIT 1;
EOF
)

if [ -z "$USER_ID" ]; then
  echo "❌ User not found with email: $EMAIL"
  exit 1
fi

echo "✅ Found user ID: $USER_ID"
echo ""

# Update user roles to include super-admin
echo "Setting user as super admin..."
cd /Users/shaunk/Projects/Parlae-AI/parlae/packages/prisma
DATABASE_URL="$DATABASE_URL" npx prisma db execute --stdin <<EOF
-- Add super-admin role
UPDATE users 
SET roles = array_append(roles, 'super-admin')
WHERE id = '$USER_ID' 
  AND NOT ('super-admin' = ANY(roles));

-- Verify
SELECT id, email, roles FROM users WHERE id = '$USER_ID';
EOF

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ User is now a super admin!"
  echo ""
  echo "The user $EMAIL now has super-admin privileges."
  echo "They may need to sign out and sign back in for changes to take effect."
else
  echo ""
  echo "❌ Failed to update user roles"
  exit 1
fi
