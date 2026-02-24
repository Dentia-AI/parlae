-- CreateEnum VoiceProvider
DO $$ BEGIN
  CREATE TYPE "VoiceProvider" AS ENUM ('vapi', 'retell');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable voice_provider_toggle (singleton row for global switch)
CREATE TABLE IF NOT EXISTS "voice_provider_toggle" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "active_provider" "VoiceProvider" NOT NULL DEFAULT 'vapi',
    "switched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "switched_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_provider_toggle_pkey" PRIMARY KEY ("id")
);

-- CreateTable retell_phone_numbers
CREATE TABLE IF NOT EXISTS "retell_phone_numbers" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "retell_phone_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "retell_agent_id" TEXT,
    "retell_agent_ids" JSONB,
    "retell_llm_ids" JSONB,
    "pms_integration_id" TEXT,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retell_phone_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for retell_phone_numbers
CREATE UNIQUE INDEX IF NOT EXISTS "retell_phone_numbers_retell_phone_id_key" ON "retell_phone_numbers"("retell_phone_id");
CREATE UNIQUE INDEX IF NOT EXISTS "retell_phone_numbers_phone_number_key" ON "retell_phone_numbers"("phone_number");
CREATE INDEX IF NOT EXISTS "retell_phone_numbers_account_id_idx" ON "retell_phone_numbers"("account_id");
CREATE INDEX IF NOT EXISTS "retell_phone_numbers_pms_integration_id_idx" ON "retell_phone_numbers"("pms_integration_id");

-- AddForeignKey retell_phone_numbers -> accounts
DO $$ BEGIN
  ALTER TABLE "retell_phone_numbers" ADD CONSTRAINT "retell_phone_numbers_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey retell_phone_numbers -> pms_integrations
DO $$ BEGIN
  ALTER TABLE "retell_phone_numbers" ADD CONSTRAINT "retell_phone_numbers_pms_integration_id_fkey"
    FOREIGN KEY ("pms_integration_id") REFERENCES "pms_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add provider column to call_references
ALTER TABLE "call_references" ADD COLUMN IF NOT EXISTS "provider" "VoiceProvider" NOT NULL DEFAULT 'vapi';
CREATE INDEX IF NOT EXISTS "call_references_provider_idx" ON "call_references"("provider");

-- Add per-account voice provider override (nullable; null = use global toggle)
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "voice_provider_override" "VoiceProvider";
