-- Seed PMS Integration Test Data for Sikka
--
-- This script sets up test data for PMS integration testing
-- Run after Prisma migrations have been applied
--
-- Usage:
--   psql $DATABASE_URL -f seed-pms-test-data.sql

-- First, get a valid account ID (use the first super admin)
\set test_account_id `psql $DATABASE_URL -tAc "SELECT id FROM accounts LIMIT 1;"`

-- Insert PMS Integration with correct Sikka credentials
INSERT INTO pms_integrations (
  id,
  account_id,
  provider,
  status,
  credentials,
  config,
  features,
  metadata,
  -- Sikka-specific fields
  practice_key,
  spu_installation_key,
  master_customer_id,
  request_key,
  refresh_key,
  token_expiry,
  office_id,
  secret_key,
  created_at,
  updated_at
) VALUES (
  'pms-integration-sikka-test',
  :'test_account_id',
  'SIKKA',
  'ACTIVE',
  -- Credentials JSON (encrypted in production)
  '{
    "appId": "b0cac8c638d52c92f9c0312159fc4518",
    "appKey": "7beec2a9e62bd692eab2e0840b8bb2db",
    "requestKey": "043d573209475b3b4567548f961d25e0",
    "refreshKey": "d77c72cff1f501a0596eb2ef0b8d5ef1",
    "officeId": "D36225",
    "secretKey": "84A9439BD3627374VGUV",
    "practiceKey": "84A9439BD3627374VGUV",
    "masterCustomerId": "D36225"
  }'::jsonb,
  -- Config
  '{
    "defaultAppointmentDuration": 30,
    "timezone": "America/Los_Angeles",
    "autoSync": true,
    "syncInterval": 300
  }'::jsonb,
  -- Features
  '{
    "appointments": true,
    "patients": true,
    "insurance": true,
    "payments": true,
    "notes": true,
    "providers": true
  }'::jsonb,
  -- Metadata
  '{
    "practiceName": "Test_Sheetal 4",
    "pmsSystem": "Opendental",
    "testAccount": true
  }'::jsonb,
  -- Sikka-specific fields (kept for backward compatibility)
  '84A9439BD3627374VGUV',           -- practice_key
  'STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=', -- spu_installation_key (legacy)
  'D36225',                          -- master_customer_id
  '043d573209475b3b4567548f961d25e0', -- request_key (24h expiry)
  'd77c72cff1f501a0596eb2ef0b8d5ef1', -- refresh_key
  NOW() + INTERVAL '24 hours',       -- token_expiry
  'D36225',                          -- office_id
  '84A9439BD3627374VGUV',           -- secret_key
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  credentials = EXCLUDED.credentials,
  request_key = EXCLUDED.request_key,
  refresh_key = EXCLUDED.refresh_key,
  token_expiry = EXCLUDED.token_expiry,
  office_id = EXCLUDED.office_id,
  secret_key = EXCLUDED.secret_key,
  updated_at = NOW();

-- Insert Vapi Phone Number linked to PMS Integration
INSERT INTO vapi_phone_numbers (
  id,
  account_id,
  vapi_phone_id,
  phone_number,
  vapi_squad_id,
  pms_integration_id,
  name,
  is_active,
  created_at,
  updated_at
) VALUES (
  'vapi-phone-test-main',
  :'test_account_id',
  'vapi-phone-placeholder-1', -- Will be replaced with real Vapi phone ID
  '+15555551234',              -- Test phone number
  'squad-placeholder-1',       -- Will be replaced with real Squad ID
  'pms-integration-sikka-test',
  'Main Office Line',
  true,
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  pms_integration_id = EXCLUDED.pms_integration_id,
  updated_at = NOW();

-- Verify the data
SELECT 
  'PMS Integration' as type,
  id,
  provider,
  status,
  office_id,
  LENGTH(request_key) as request_key_length,
  token_expiry
FROM pms_integrations
WHERE id = 'pms-integration-sikka-test';

SELECT
  'Vapi Phone' as type,
  id,
  phone_number,
  name,
  pms_integration_id
FROM vapi_phone_numbers
WHERE id = 'vapi-phone-test-main';

ECHO '✅ Seed data inserted successfully!';
ECHO '';
ECHO '📝 Next Steps:';
ECHO '   1. Run: node scripts/test-sikka-auth-flow.js';
ECHO '   2. Update token_expiry if expired (token valid for 24h)';
ECHO '   3. Set up background job for token refresh';
ECHO '';
