-- Reconcile VapiPhoneNumber table (may already exist from 20260131 migration)
CREATE TABLE IF NOT EXISTS "vapi_phone_numbers" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "vapi_phone_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "vapi_assistant_id" TEXT,
    "vapi_squad_id" TEXT,
    "pms_integration_id" TEXT,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vapi_phone_numbers_pkey" PRIMARY KEY ("id")
);

-- Add columns that may be missing from the earlier version
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "vapi_phone_id" TEXT;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "vapi_assistant_id" TEXT;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "vapi_squad_id" TEXT;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "pms_integration_id" TEXT;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "vapi_phone_numbers" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN DEFAULT true;

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "vapi_phone_numbers_vapi_phone_id_key" ON "vapi_phone_numbers"("vapi_phone_id");
CREATE UNIQUE INDEX IF NOT EXISTS "vapi_phone_numbers_phone_number_key" ON "vapi_phone_numbers"("phone_number");
CREATE INDEX IF NOT EXISTS "vapi_phone_numbers_account_id_idx" ON "vapi_phone_numbers"("account_id");
CREATE INDEX IF NOT EXISTS "vapi_phone_numbers_pms_integration_id_idx" ON "vapi_phone_numbers"("pms_integration_id");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "vapi_phone_numbers" ADD CONSTRAINT "vapi_phone_numbers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pms_integrations') THEN
    ALTER TABLE "vapi_phone_numbers" ADD CONSTRAINT "vapi_phone_numbers_pms_integration_id_fkey" FOREIGN KEY ("pms_integration_id") REFERENCES "pms_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add Sikka-specific fields to PmsIntegration (table may not exist yet; created in 20260216)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pms_integrations') THEN
    ALTER TABLE "pms_integrations" ADD COLUMN IF NOT EXISTS "practice_key" TEXT;
    ALTER TABLE "pms_integrations" ADD COLUMN IF NOT EXISTS "spu_installation_key" TEXT;
    ALTER TABLE "pms_integrations" ADD COLUMN IF NOT EXISTS "master_customer_id" TEXT;
  END IF;
END $$;
