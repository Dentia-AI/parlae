-- AlterTable: Add feature_settings column to accounts
-- Stores per-account feature toggles (e.g. sms-confirmations, email-confirmations)
ALTER TABLE "accounts" ADD COLUMN "feature_settings" JSONB DEFAULT '{}';
