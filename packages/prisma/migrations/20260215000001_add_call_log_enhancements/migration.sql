-- ============================================================================
-- Add Call Log Enhancements for Transcripts, Structured Output, and HIPAA
-- ============================================================================

-- Add account_id for direct account association
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "account_id" TEXT;

-- Make voice_agent_id optional (calls from webhooks may not have an agent)
ALTER TABLE "call_logs" ALTER COLUMN "voice_agent_id" DROP NOT NULL;

-- Add default to direction column
ALTER TABLE "call_logs" ALTER COLUMN "direction" SET DEFAULT 'inbound';

-- Add structured data fields from Vapi end-of-call analysis
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "structured_data" JSONB;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "call_reason" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "urgency_level" TEXT;

-- Add HIPAA audit trail
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "access_log" JSONB;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS "call_logs_account_id_idx" ON "call_logs"("account_id");
CREATE INDEX IF NOT EXISTS "call_logs_call_reason_idx" ON "call_logs"("call_reason");

-- Add foreign key for account_id
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

-- Update existing voice_agent_id constraint to SET NULL instead of CASCADE
-- (Prevents call log deletion when voice agent is removed)
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'call_logs_voice_agent_id_fkey'
        AND table_name = 'call_logs'
    ) THEN
        ALTER TABLE "call_logs" DROP CONSTRAINT "call_logs_voice_agent_id_fkey";
    END IF;

    ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_voice_agent_id_fkey"
        FOREIGN KEY ("voice_agent_id") REFERENCES "voice_agents"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN "call_logs"."account_id" IS 'Direct link to account for easy filtering - resolved from phone number';
COMMENT ON COLUMN "call_logs"."structured_data" IS 'Vapi AI-extracted structured output from end-of-call analysis (CALL_ANALYSIS_SCHEMA)';
COMMENT ON COLUMN "call_logs"."call_reason" IS 'Denormalized from structured_data for efficient filtering';
COMMENT ON COLUMN "call_logs"."urgency_level" IS 'Urgency: routine, soon, urgent, emergency';
COMMENT ON COLUMN "call_logs"."access_log" IS 'HIPAA audit trail - records who accessed this PHI record';
