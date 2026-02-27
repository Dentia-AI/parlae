-- Add per-account Retell agent IDs and template versioning to outbound_settings

ALTER TABLE "outbound_settings"
  ADD COLUMN "patient_care_retell_agent_id" TEXT,
  ADD COLUMN "financial_retell_agent_id" TEXT,
  ADD COLUMN "outbound_template_version" TEXT,
  ADD COLUMN "outbound_upgrade_history" JSONB NOT NULL DEFAULT '[]';
