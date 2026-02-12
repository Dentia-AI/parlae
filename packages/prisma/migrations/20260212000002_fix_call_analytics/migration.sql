-- Fix call analytics columns if they don't exist
-- This handles cases where 20260211000000_add_call_analytics_and_outbound failed silently

-- Create enums if they don't exist
DO $$ BEGIN
    CREATE TYPE "CallOutcome" AS ENUM ('booked', 'transferred', 'insurance_inquiry', 'payment_plan', 'information', 'voicemail', 'no_answer', 'busy', 'failed', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CallType" AS ENUM ('inbound', 'outbound_lead', 'outbound_debt', 'outbound_followup', 'outbound_campaign', 'outbound_other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CallStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'missed', 'voicemail', 'failed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add columns if they don't exist
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "vapi_call_id" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_type" "CallType" NOT NULL DEFAULT 'inbound';
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "status" "CallStatus" NOT NULL DEFAULT 'completed';
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "outcome" "CallOutcome" NOT NULL DEFAULT 'other';
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

-- Create indexes if they don't exist
CREATE UNIQUE INDEX IF NOT EXISTS "call_logs_vapi_call_id_key" ON "call_logs"("vapi_call_id");
CREATE INDEX IF NOT EXISTS "call_logs_call_type_idx" ON "call_logs"("call_type");
CREATE INDEX IF NOT EXISTS "call_logs_outcome_idx" ON "call_logs"("outcome");
CREATE INDEX IF NOT EXISTS "call_logs_status_idx" ON "call_logs"("status");
CREATE INDEX IF NOT EXISTS "call_logs_campaign_id_idx" ON "call_logs"("campaign_id");
CREATE INDEX IF NOT EXISTS "call_logs_scheduled_at_idx" ON "call_logs"("scheduled_at");

-- Data migration (safe to run multiple times)
UPDATE "call_logs" 
SET "outcome" = 'booked' 
WHERE "appointment_set" = true AND "outcome" = 'other';

UPDATE "call_logs" 
SET "outcome" = 'information' 
WHERE "lead_captured" = true AND "appointment_set" = false AND "outcome" = 'other';
