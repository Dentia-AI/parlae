-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('booked', 'transferred', 'insurance_inquiry', 'payment_plan', 'information', 'voicemail', 'no_answer', 'busy', 'failed', 'other');

-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('inbound', 'outbound_lead', 'outbound_debt', 'outbound_followup', 'outbound_campaign', 'outbound_other');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'missed', 'voicemail', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "call_logs" ADD COLUMN "vapi_call_id" TEXT,
ADD COLUMN "call_type" "CallType" NOT NULL DEFAULT 'inbound',
ADD COLUMN "status" "CallStatus" NOT NULL DEFAULT 'completed',
ADD COLUMN "outcome" "CallOutcome" NOT NULL DEFAULT 'other',
ADD COLUMN "insurance_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "insurance_provider" TEXT,
ADD COLUMN "payment_plan_discussed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "payment_plan_amount" INTEGER,
ADD COLUMN "collection_attempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "collection_amount" INTEGER,
ADD COLUMN "collection_success" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "transferred_to_staff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "transferred_to" TEXT,
ADD COLUMN "campaign_id" TEXT,
ADD COLUMN "scheduled_at" TIMESTAMP(3),
ADD COLUMN "call_purpose" TEXT,
ADD COLUMN "call_notes" TEXT,
ADD COLUMN "follow_up_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "follow_up_date" TIMESTAMP(3),
ADD COLUMN "call_quality" INTEGER,
ADD COLUMN "customer_sentiment" TEXT,
ADD COLUMN "ai_confidence" DOUBLE PRECISION,
ADD COLUMN "cost_cents" INTEGER,
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_vapi_call_id_key" ON "call_logs"("vapi_call_id");

-- CreateIndex
CREATE INDEX "call_logs_call_type_idx" ON "call_logs"("call_type");

-- CreateIndex
CREATE INDEX "call_logs_outcome_idx" ON "call_logs"("outcome");

-- CreateIndex
CREATE INDEX "call_logs_status_idx" ON "call_logs"("status");

-- CreateIndex
CREATE INDEX "call_logs_campaign_id_idx" ON "call_logs"("campaign_id");

-- CreateIndex
CREATE INDEX "call_logs_scheduled_at_idx" ON "call_logs"("scheduled_at");

-- Data Migration: Update existing records based on existing fields
-- Map appointmentSet to BOOKED outcome
UPDATE "call_logs" 
SET "outcome" = 'booked' 
WHERE "appointment_set" = true;

-- Map leadCaptured but not appointmentSet to INFORMATION
UPDATE "call_logs" 
SET "outcome" = 'information' 
WHERE "lead_captured" = true AND "appointment_set" = false;

-- Map inbound/outbound direction to call_type
-- Note: The direction column will remain for backward compatibility
-- But new code should use call_type instead
