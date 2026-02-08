-- Migration: Add AI Receptionist phone integration fields
-- This adds the necessary fields to support the AI Receptionist onboarding wizard

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

-- Example phone_integration_settings structure:
-- {
--   "businessName": "Smile Dental Clinic",
--   "areaCode": "416",
--   "phoneNumber": "+14165551234",
--   "vapiAssistantId": "asst_xxx",
--   "vapiSquadId": "squad_xxx",
--   "vapiPhoneId": "phone_xxx",
--   "voiceConfig": {
--     "id": "rachel-11labs",
--     "name": "Rachel",
--     "provider": "11labs",
--     "voiceId": "rachel",
--     "gender": "female",
--     "accent": "American",
--     "description": "Warm and professional voice"
--   },
--   "knowledgeBaseFileIds": ["file_xxx", "file_yyy"]
-- }
