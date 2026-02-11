-- CreateTable VapiPhoneNumber
CREATE TABLE "vapi_phone_numbers" (
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

-- CreateIndex
CREATE UNIQUE INDEX "vapi_phone_numbers_vapi_phone_id_key" ON "vapi_phone_numbers"("vapi_phone_id");
CREATE UNIQUE INDEX "vapi_phone_numbers_phone_number_key" ON "vapi_phone_numbers"("phone_number");
CREATE INDEX "vapi_phone_numbers_account_id_idx" ON "vapi_phone_numbers"("account_id");
CREATE INDEX "vapi_phone_numbers_pms_integration_id_idx" ON "vapi_phone_numbers"("pms_integration_id");

-- AddForeignKey
ALTER TABLE "vapi_phone_numbers" ADD CONSTRAINT "vapi_phone_numbers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vapi_phone_numbers" ADD CONSTRAINT "vapi_phone_numbers_pms_integration_id_fkey" FOREIGN KEY ("pms_integration_id") REFERENCES "pms_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add Sikka-specific fields to PmsIntegration
ALTER TABLE "pms_integrations" ADD COLUMN "practice_key" TEXT;
ALTER TABLE "pms_integrations" ADD COLUMN "spu_installation_key" TEXT;
ALTER TABLE "pms_integrations" ADD COLUMN "master_customer_id" TEXT;
