-- AlterTable
ALTER TABLE "outbound_settings" ADD COLUMN IF NOT EXISTS "auto_approve_campaigns" BOOLEAN NOT NULL DEFAULT false;
