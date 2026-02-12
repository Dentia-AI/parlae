#!/bin/bash
# Apply missing database migration for phone_integration_method

echo "🗄️  Applying missing migration: add_ai_receptionist_fields"
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

# Apply the SQL migration
echo "Running migration SQL..."
psql "$DATABASE_URL" <<'EOF'
-- Add phone integration fields to accounts table
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS phone_integration_method TEXT 
  CHECK (phone_integration_method IN ('none', 'ported', 'forwarded', 'sip'))
  DEFAULT 'none',
ADD COLUMN IF NOT EXISTS phone_integration_settings JSONB 
  DEFAULT '{}'::jsonb;

-- Add comment explaining the fields
COMMENT ON COLUMN accounts.phone_integration_method IS 
  'Phone integration method: none (not set up), ported (number ported to Twilio), forwarded (call forwarding), sip (SIP trunk)';

COMMENT ON COLUMN accounts.phone_integration_settings IS 
  'Phone integration configuration including businessName, areaCode, phoneNumber, vapiAssistantId, vapiSquadId, vapiPhoneId, voiceConfig, knowledgeBaseFileIds';

-- Create index for quick lookups by integration method
CREATE INDEX IF NOT EXISTS idx_accounts_phone_integration_method 
ON accounts(phone_integration_method) 
WHERE phone_integration_method != 'none';

EOF

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migration applied successfully!"
  echo ""
  echo "The database now has:"
  echo "  - accounts.phone_integration_method column"
  echo "  - accounts.phone_integration_settings column"
  echo "  - Index on phone_integration_method"
else
  echo ""
  echo "❌ Migration failed!"
  exit 1
fi
