-- ============================================================================
-- COMPREHENSIVE SCHEMA SAFETY NET
-- ============================================================================
-- This migration ensures ALL required schema elements exist in production.
-- It is fully idempotent - safe to run multiple times.
-- It handles cases where prior migrations may have partially applied or
-- where columns were created with wrong names (camelCase vs snake_case).
-- ============================================================================

-- ── 1. ENUMS ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE "CallOutcome" AS ENUM (
        'booked', 'transferred', 'insurance_inquiry', 'payment_plan',
        'information', 'voicemail', 'no_answer', 'busy', 'failed', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "CallType" AS ENUM (
        'inbound', 'outbound_lead', 'outbound_debt', 'outbound_followup',
        'outbound_campaign', 'outbound_other'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "CallStatus" AS ENUM (
        'scheduled', 'in_progress', 'completed', 'missed',
        'voicemail', 'failed', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. ACCOUNTS TABLE ───────────────────────────────────────────────────────

-- Phone integration fields (from 20260212000000_add_phone_integration_fields)
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "phone_integration_method" TEXT DEFAULT 'none';
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "phone_integration_settings" JSONB DEFAULT '{}'::jsonb;

-- Advanced setup (from 20260204000000_add_advanced_setup_access)
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "advanced_setup_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Agent template FK (from 20260204000001_add_agent_templates)
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "agent_template_id" TEXT;

-- Setup wizard progress (from 20260211000001_add_setup_progress)
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "setup_progress" JSONB DEFAULT '{}';
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "setup_completed_at" TIMESTAMP(3);
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "setup_last_step" TEXT;

-- Google Calendar (from 20260211000002_add_google_calendar)
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_connected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_access_token" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_refresh_token" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_token_expiry" TIMESTAMP(3);
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_id" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "google_calendar_email" TEXT;

-- Payment verification (from 20260212000000_add_payment_verification)
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "stripe_payment_method_id" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "payment_method_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "payment_method_verified_at" TIMESTAMP(3);

-- Branding fields (from 20260214000000_add_branding_fields)
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_logo_url" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_primary_color" VARCHAR(7);
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_business_name" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_contact_email" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_contact_phone" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_address" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_website" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "twilio_messaging_service_sid" TEXT;

-- ── 3. CALL_LOGS TABLE ──────────────────────────────────────────────────────

ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "account_id" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "vapi_call_id" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_type" "CallType" NOT NULL DEFAULT 'inbound';
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "status" "CallStatus" NOT NULL DEFAULT 'completed';
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "outcome" "CallOutcome" NOT NULL DEFAULT 'other';
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "structured_data" JSONB;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_reason" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "urgency_level" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "insurance_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "insurance_provider" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "payment_plan_discussed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "payment_plan_amount" INTEGER;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "collection_attempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "collection_amount" INTEGER;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "collection_success" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "transferred_to_staff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "transferred_to" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "campaign_id" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMP(3);
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_purpose" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_notes" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "follow_up_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "follow_up_date" TIMESTAMP(3);
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_quality" INTEGER;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "customer_sentiment" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "ai_confidence" DOUBLE PRECISION;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "cost_cents" INTEGER;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "access_log" JSONB;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── 4. AGENT_TEMPLATES TABLE ────────────────────────────────────────────────

-- Create table if it doesn't exist (from 20260204000001_add_agent_templates)
CREATE TABLE IF NOT EXISTS "agent_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
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
    "created_by" TEXT
);

-- Fix camelCase → snake_case column naming if needed (from prisma db push)
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'displayName'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'display_name'
    ) THEN
        ALTER TABLE "agent_templates" RENAME COLUMN "displayName" TO "display_name";
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'isDefault'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'is_default'
    ) THEN
        ALTER TABLE "agent_templates" RENAME COLUMN "isDefault" TO "is_default";
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'isActive'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE "agent_templates" RENAME COLUMN "isActive" TO "is_active";
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'squadConfig'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'squad_config'
    ) THEN
        ALTER TABLE "agent_templates" RENAME COLUMN "squadConfig" TO "squad_config";
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'assistantConfig'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'assistant_config'
    ) THEN
        ALTER TABLE "agent_templates" RENAME COLUMN "assistantConfig" TO "assistant_config";
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'toolsConfig'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'tools_config'
    ) THEN
        ALTER TABLE "agent_templates" RENAME COLUMN "toolsConfig" TO "tools_config";
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'modelConfig'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'model_config'
    ) THEN
        ALTER TABLE "agent_templates" RENAME COLUMN "modelConfig" TO "model_config";
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'createdAt'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE "agent_templates" RENAME COLUMN "createdAt" TO "created_at";
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'updatedAt'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE "agent_templates" RENAME COLUMN "updatedAt" TO "updated_at";
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'createdBy'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_templates' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE "agent_templates" RENAME COLUMN "createdBy" TO "created_by";
    END IF;
END $$;

-- ── 5. INDEXES (IF NOT EXISTS) ──────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "call_logs_vapi_call_id_key" ON "call_logs"("vapi_call_id");
CREATE INDEX IF NOT EXISTS "call_logs_account_id_idx" ON "call_logs"("account_id");
CREATE INDEX IF NOT EXISTS "call_logs_call_type_idx" ON "call_logs"("call_type");
CREATE INDEX IF NOT EXISTS "call_logs_outcome_idx" ON "call_logs"("outcome");
CREATE INDEX IF NOT EXISTS "call_logs_status_idx" ON "call_logs"("status");
CREATE INDEX IF NOT EXISTS "call_logs_campaign_id_idx" ON "call_logs"("campaign_id");
CREATE INDEX IF NOT EXISTS "call_logs_scheduled_at_idx" ON "call_logs"("scheduled_at");
CREATE INDEX IF NOT EXISTS "call_logs_call_reason_idx" ON "call_logs"("call_reason");
CREATE INDEX IF NOT EXISTS "agent_templates_category_idx" ON "agent_templates"("category");
CREATE INDEX IF NOT EXISTS "agent_templates_is_default_idx" ON "agent_templates"("is_default");
CREATE INDEX IF NOT EXISTS "idx_accounts_phone_integration_method" ON "accounts"("phone_integration_method") WHERE "phone_integration_method" != 'none';

-- ── 6. FOREIGN KEYS (safe to add if missing) ───────────────────────────────

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'accounts_agent_template_id_fkey'
    ) THEN
        ALTER TABLE "accounts" ADD CONSTRAINT "accounts_agent_template_id_fkey"
            FOREIGN KEY ("agent_template_id") REFERENCES "agent_templates"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'call_logs_account_id_fkey'
    ) THEN
        ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_account_id_fkey"
            FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ── 7. SUPER ADMIN (from 20260212000001_make_shaun_super_admin) ─────────────

UPDATE "users"
SET "role" = 'super_admin'
WHERE "email" = 'shaun.everbridge@gmail.com'
  AND "role" != 'super_admin';

-- ── 8. DATA MIGRATION (from 20260212000002_fix_call_analytics) ──────────────

UPDATE "call_logs"
SET "outcome" = 'booked'
WHERE "appointment_set" = true AND "outcome" = 'other';

UPDATE "call_logs"
SET "outcome" = 'information'
WHERE "lead_captured" = true AND "appointment_set" = false AND "outcome" = 'other';

-- ============================================================================
-- END: All schema elements verified / created
-- ============================================================================
