-- AlterTable
ALTER TABLE "accounts" 
ADD COLUMN "setup_progress" JSONB DEFAULT '{}',
ADD COLUMN "setup_completed_at" TIMESTAMP(3),
ADD COLUMN "setup_last_step" TEXT;

-- Add comment for documentation
COMMENT ON COLUMN "accounts"."setup_progress" IS 'Stores setup wizard progress for each step (voice, knowledge, integrations, phone, review)';
COMMENT ON COLUMN "accounts"."setup_completed_at" IS 'Timestamp when the full setup wizard was completed';
COMMENT ON COLUMN "accounts"."setup_last_step" IS 'Last step user was on in the setup wizard';
