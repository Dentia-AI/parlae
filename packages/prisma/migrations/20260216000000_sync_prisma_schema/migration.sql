-- ============================================================================
-- Comprehensive Schema Sync Migration
-- Purpose: Bring the database fully in sync with the Prisma schema.
--          This migration is IDEMPOTENT — safe to run on any DB state.
-- ============================================================================

-- ============================================================================
-- 1. CREATE MISSING ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "PmsProvider" AS ENUM ('sikka', 'kolla', 'dentrix', 'eaglesoft', 'open_dental', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PmsConnectionStatus" AS ENUM ('active', 'inactive', 'error', 'setup_required');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure CallOutcome, CallType, CallStatus enums exist (created in earlier migrations, but just in case)
DO $$ BEGIN
  CREATE TYPE "CallOutcome" AS ENUM ('booked', 'transferred', 'insurance_inquiry', 'payment_plan', 'information', 'voicemail', 'no_answer', 'busy', 'failed', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CallType" AS ENUM ('inbound', 'outbound_lead', 'outbound_debt', 'outbound_followup', 'outbound_campaign', 'outbound_other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CallStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'missed', 'voicemail', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 2. CREATE PMS TABLES
-- ============================================================================

-- 2a. pms_integrations
CREATE TABLE IF NOT EXISTS "pms_integrations" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider" "PmsProvider" NOT NULL,
    "provider_name" TEXT,
    "status" "PmsConnectionStatus" NOT NULL DEFAULT 'setup_required',
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "config" JSONB,
    "features" JSONB,
    "metadata" JSONB,
    "practice_key" TEXT,
    "spu_installation_key" TEXT,
    "master_customer_id" TEXT,
    "request_key" TEXT,
    "refresh_key" TEXT,
    "token_expiry" TIMESTAMP(3),
    "office_id" TEXT,
    "secret_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_integrations_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "pms_integrations_account_id_provider_key" ON "pms_integrations"("account_id", "provider");
CREATE INDEX IF NOT EXISTS "pms_integrations_account_id_idx" ON "pms_integrations"("account_id");
CREATE INDEX IF NOT EXISTS "pms_integrations_status_idx" ON "pms_integrations"("status");
CREATE INDEX IF NOT EXISTS "pms_integrations_token_expiry_idx" ON "pms_integrations"("token_expiry");

-- FK (use DO block to handle case where FK already exists)
DO $$ BEGIN
  ALTER TABLE "pms_integrations" ADD CONSTRAINT "pms_integrations_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2b. pms_audit_logs
CREATE TABLE IF NOT EXISTS "pms_audit_logs" (
    "id" TEXT NOT NULL,
    "pms_integration_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "user_id" TEXT,
    "vapi_call_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_summary" TEXT,
    "response_status" INTEGER,
    "response_time" INTEGER,
    "phi_accessed" BOOLEAN NOT NULL DEFAULT false,
    "patient_id" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pms_audit_logs_pms_integration_id_idx" ON "pms_audit_logs"("pms_integration_id");
CREATE INDEX IF NOT EXISTS "pms_audit_logs_created_at_idx" ON "pms_audit_logs"("created_at");
CREATE INDEX IF NOT EXISTS "pms_audit_logs_action_idx" ON "pms_audit_logs"("action");
CREATE INDEX IF NOT EXISTS "pms_audit_logs_vapi_call_id_idx" ON "pms_audit_logs"("vapi_call_id");
CREATE INDEX IF NOT EXISTS "pms_audit_logs_patient_id_idx" ON "pms_audit_logs"("patient_id");

DO $$ BEGIN
  ALTER TABLE "pms_audit_logs" ADD CONSTRAINT "pms_audit_logs_pms_integration_id_fkey"
    FOREIGN KEY ("pms_integration_id") REFERENCES "pms_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2c. pms_writebacks
CREATE TABLE IF NOT EXISTS "pms_writebacks" (
    "id" TEXT NOT NULL,
    "pms_integration_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_body" JSONB NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "check_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pms_writebacks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pms_writebacks_pms_integration_id_idx" ON "pms_writebacks"("pms_integration_id");
CREATE INDEX IF NOT EXISTS "pms_writebacks_result_idx" ON "pms_writebacks"("result");
CREATE INDEX IF NOT EXISTS "pms_writebacks_submitted_at_idx" ON "pms_writebacks"("submitted_at");

DO $$ BEGIN
  ALTER TABLE "pms_writebacks" ADD CONSTRAINT "pms_writebacks_pms_integration_id_fkey"
    FOREIGN KEY ("pms_integration_id") REFERENCES "pms_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2d. pms_cached_data
CREATE TABLE IF NOT EXISTS "pms_cached_data" (
    "id" TEXT NOT NULL,
    "pms_integration_id" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "cache_type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_cached_data_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pms_cached_data_pms_integration_id_cache_key_key" ON "pms_cached_data"("pms_integration_id", "cache_key");
CREATE INDEX IF NOT EXISTS "pms_cached_data_pms_integration_id_idx" ON "pms_cached_data"("pms_integration_id");
CREATE INDEX IF NOT EXISTS "pms_cached_data_expires_at_idx" ON "pms_cached_data"("expires_at");
CREATE INDEX IF NOT EXISTS "pms_cached_data_cache_type_idx" ON "pms_cached_data"("cache_type");

DO $$ BEGIN
  ALTER TABLE "pms_cached_data" ADD CONSTRAINT "pms_cached_data_pms_integration_id_fkey"
    FOREIGN KEY ("pms_integration_id") REFERENCES "pms_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 3. RECONCILE vapi_phone_numbers TABLE
--    The old migration (20260131) created this with a completely different schema.
--    The current Prisma model expects different columns.
--    Strategy: Add missing columns from current schema. Old columns become harmless extras.
-- ============================================================================

-- Columns that exist in current Prisma schema but may be missing from old table
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "vapi_phone_id" TEXT;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "vapi_assistant_id" TEXT;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "vapi_squad_id" TEXT;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "pms_integration_id" TEXT;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN DEFAULT true;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "twilio_phone_number_sid" TEXT;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "twilio_messaging_service_sid" TEXT;

-- Ensure unique indexes exist for the current schema columns
CREATE UNIQUE INDEX IF NOT EXISTS "vapi_phone_numbers_vapi_phone_id_key" ON "vapi_phone_numbers"("vapi_phone_id");
CREATE INDEX IF NOT EXISTS "vapi_phone_numbers_pms_integration_id_idx" ON "vapi_phone_numbers"("pms_integration_id");

-- FK from vapi_phone_numbers to pms_integrations (now that pms_integrations exists)
DO $$ BEGIN
  ALTER TABLE "vapi_phone_numbers" ADD CONSTRAINT "vapi_phone_numbers_pms_integration_id_fkey"
    FOREIGN KEY ("pms_integration_id") REFERENCES "pms_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 4. ADD MISSING COLUMNS TO knowledge_base
--    Sikka-specific fields added to schema but never migrated.
-- ============================================================================

ALTER TABLE "knowledge_base" ADD COLUMN IF NOT EXISTS "practice_key" TEXT;
ALTER TABLE "knowledge_base" ADD COLUMN IF NOT EXISTS "spu_installation_key" TEXT;
ALTER TABLE "knowledge_base" ADD COLUMN IF NOT EXISTS "master_customer_id" TEXT;
ALTER TABLE "knowledge_base" ADD COLUMN IF NOT EXISTS "request_key" TEXT;
ALTER TABLE "knowledge_base" ADD COLUMN IF NOT EXISTS "refresh_key" TEXT;
ALTER TABLE "knowledge_base" ADD COLUMN IF NOT EXISTS "token_expiry" TIMESTAMP(3);
ALTER TABLE "knowledge_base" ADD COLUMN IF NOT EXISTS "office_id" TEXT;
ALTER TABLE "knowledge_base" ADD COLUMN IF NOT EXISTS "secret_key" TEXT;


-- ============================================================================
-- 5. ENSURE call_logs HAS ALL REQUIRED COLUMNS
--    Most were added in ensure_production_schema, but verify completeness.
-- ============================================================================

ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "account_id" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "vapi_call_id" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_type" "CallType" DEFAULT 'inbound';
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "status" "CallStatus" DEFAULT 'completed';
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "outcome" "CallOutcome" DEFAULT 'other';
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "structured_data" JSONB;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_reason" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "urgency_level" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "insurance_verified" BOOLEAN DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "insurance_provider" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "payment_plan_discussed" BOOLEAN DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "payment_plan_amount" INTEGER;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "collection_attempt" BOOLEAN DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "collection_amount" INTEGER;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "collection_success" BOOLEAN DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "transferred_to_staff" BOOLEAN DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "transferred_to" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "campaign_id" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMP(3);
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_purpose" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_notes" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "follow_up_required" BOOLEAN DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "follow_up_date" TIMESTAMP(3);
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_quality" INTEGER;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "customer_sentiment" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "ai_confidence" DOUBLE PRECISION;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "cost_cents" INTEGER;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "actions" JSONB;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "access_log" JSONB;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "direction" TEXT DEFAULT 'inbound';

-- Indexes for call_logs
CREATE UNIQUE INDEX IF NOT EXISTS "call_logs_vapi_call_id_key" ON "call_logs"("vapi_call_id");
CREATE INDEX IF NOT EXISTS "call_logs_account_id_idx" ON "call_logs"("account_id");
CREATE INDEX IF NOT EXISTS "call_logs_call_type_idx" ON "call_logs"("call_type");
CREATE INDEX IF NOT EXISTS "call_logs_outcome_idx" ON "call_logs"("outcome");
CREATE INDEX IF NOT EXISTS "call_logs_status_idx" ON "call_logs"("status");
CREATE INDEX IF NOT EXISTS "call_logs_campaign_id_idx" ON "call_logs"("campaign_id");
CREATE INDEX IF NOT EXISTS "call_logs_scheduled_at_idx" ON "call_logs"("scheduled_at");
CREATE INDEX IF NOT EXISTS "call_logs_call_reason_idx" ON "call_logs"("call_reason");

-- FK: call_logs.account_id -> accounts.id
DO $$ BEGIN
  ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 6. ENSURE accounts TABLE HAS ALL REQUIRED COLUMNS
--    Verify every column from Prisma schema exists.
-- ============================================================================

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "phone_integration_method" TEXT DEFAULT 'none';
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "phone_integration_settings" JSONB DEFAULT '{}';
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "advanced_setup_enabled" BOOLEAN DEFAULT false;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "agent_template_id" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "setup_progress" JSONB DEFAULT '{}';
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "setup_completed_at" TIMESTAMP(3);
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "setup_last_step" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_connected" BOOLEAN DEFAULT false;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_access_token" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_refresh_token" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_token_expiry" TIMESTAMP(3);
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_id" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_email" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "stripe_payment_method_id" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "payment_method_verified" BOOLEAN DEFAULT false;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "payment_method_verified_at" TIMESTAMP(3);
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_logo_url" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_primary_color" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_business_name" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_contact_email" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_contact_phone" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_address" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_website" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "twilio_messaging_service_sid" TEXT;

-- Unique index on stripe_customer_id
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_stripe_customer_id_key" ON "accounts"("stripe_customer_id");

-- FK: accounts.agent_template_id -> agent_templates.id
DO $$ BEGIN
  ALTER TABLE "accounts" ADD CONSTRAINT "accounts_agent_template_id_fkey"
    FOREIGN KEY ("agent_template_id") REFERENCES "agent_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 7. ENSURE agent_templates TABLE EXISTS AND HAS ALL COLUMNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "agent_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "squad_config" JSONB NOT NULL,
    "assistant_config" JSONB NOT NULL,
    "tools_config" JSONB,
    "model_config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "agent_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_templates_name_key" ON "agent_templates"("name");
CREATE INDEX IF NOT EXISTS "agent_templates_category_idx" ON "agent_templates"("category");
CREATE INDEX IF NOT EXISTS "agent_templates_is_default_idx" ON "agent_templates"("is_default");

-- Ensure tools_config column exists (may be missing from earlier agent_templates creation)
ALTER TABLE "agent_templates" ADD COLUMN IF NOT EXISTS "tools_config" JSONB;


-- ============================================================================
-- 8. ENSURE users TABLE HAS ALL REQUIRED COLUMNS
-- ============================================================================

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cognito_username" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" "UserRole" DEFAULT 'account_manager';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_cognito_username_key" ON "users"("cognito_username");


-- ============================================================================
-- 9. MAKE voice_agent_id NULLABLE ON call_logs (required by schema)
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE "call_logs" ALTER COLUMN "voice_agent_id" DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;


-- ============================================================================
-- DONE - Database should now be fully consistent with Prisma schema.
-- Orphan tables from old migrations (vapi_squad_templates, vapi_assistant_templates,
-- vapi_account_knowledge, vapi_call_logs) are left in place — they are harmless
-- and may contain data. They can be dropped manually if desired.
-- ============================================================================
