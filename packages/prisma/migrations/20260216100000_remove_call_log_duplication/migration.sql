-- Remove Vapi data duplication: replace heavy CallLog table with thin CallReference.
-- All call data (transcripts, recordings, analytics) will be fetched from Vapi API on demand.

-- Step 1: Create the new call_references table
CREATE TABLE IF NOT EXISTS "call_references" (
    "id" TEXT NOT NULL,
    "vapi_call_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_references_pkey" PRIMARY KEY ("id")
);

-- Step 2: Migrate existing call_logs data into call_references (preserve the mapping)
INSERT INTO "call_references" ("id", "vapi_call_id", "account_id", "created_at")
SELECT "id", "vapi_call_id", "account_id", "created_at"
FROM "call_logs"
WHERE "vapi_call_id" IS NOT NULL
  AND "account_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 3: Add unique constraint and indexes
CREATE UNIQUE INDEX "call_references_vapi_call_id_key" ON "call_references"("vapi_call_id");
CREATE INDEX "call_references_account_id_idx" ON "call_references"("account_id");
CREATE INDEX "call_references_created_at_idx" ON "call_references"("created_at");

-- Step 4: Add foreign key
ALTER TABLE "call_references" ADD CONSTRAINT "call_references_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: Drop the old call_logs table and its enums
DROP TABLE IF EXISTS "call_logs";

-- Drop enums that were only used by call_logs
DROP TYPE IF EXISTS "call_outcome";
DROP TYPE IF EXISTS "call_type";
DROP TYPE IF EXISTS "call_status";
