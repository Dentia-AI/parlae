-- AlterTable
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "phone_number_history" JSONB DEFAULT '[]';
