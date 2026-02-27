-- Outbound Calling System
-- Adds: enums, OutboundCampaign, CampaignContact, OutboundAgentTemplate,
--        OutboundSettings, DoNotCallEntry tables + Account relations.

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE "OutboundChannel" AS ENUM ('phone', 'sms', 'email');
CREATE TYPE "OutboundAgentGroup" AS ENUM ('patient_care', 'financial');
CREATE TYPE "OutboundCallStatus" AS ENUM (
  'queued', 'dialing', 'in_progress', 'completed',
  'failed', 'no_answer', 'voicemail', 'busy', 'cancelled'
);
CREATE TYPE "OutboundCampaignStatus" AS ENUM (
  'draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'
);
CREATE TYPE "OutboundCallType" AS ENUM (
  'recall', 'reminder', 'followup', 'noshow', 'treatment_plan',
  'postop', 'reactivation', 'survey', 'welcome', 'payment', 'benefits'
);

-- ============================================================================
-- OutboundCampaign
-- ============================================================================

CREATE TABLE "outbound_campaigns" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "account_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "call_type" "OutboundCallType" NOT NULL,
  "channel" "OutboundChannel" NOT NULL DEFAULT 'phone',
  "status" "OutboundCampaignStatus" NOT NULL DEFAULT 'draft',
  "is_auto_generated" BOOLEAN NOT NULL DEFAULT false,

  "scheduled_start_at" TIMESTAMP(3),
  "scheduled_end_at" TIMESTAMP(3),
  "calling_window_start" TEXT,
  "calling_window_end" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
  "max_concurrent" INTEGER NOT NULL DEFAULT 1,
  "max_attempts_per_contact" INTEGER NOT NULL DEFAULT 3,

  "retell_agent_id" TEXT,
  "dynamic_variables" JSONB,

  "total_contacts" INTEGER NOT NULL DEFAULT 0,
  "completed_count" INTEGER NOT NULL DEFAULT 0,
  "successful_count" INTEGER NOT NULL DEFAULT 0,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_by" TEXT,

  CONSTRAINT "outbound_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbound_campaigns_account_id_idx" ON "outbound_campaigns"("account_id");
CREATE INDEX "outbound_campaigns_status_idx" ON "outbound_campaigns"("status");
CREATE INDEX "outbound_campaigns_call_type_idx" ON "outbound_campaigns"("call_type");
CREATE INDEX "outbound_campaigns_account_id_status_idx" ON "outbound_campaigns"("account_id", "status");

ALTER TABLE "outbound_campaigns"
  ADD CONSTRAINT "outbound_campaigns_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- CampaignContact
-- ============================================================================

CREATE TABLE "campaign_contacts" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" TEXT NOT NULL,

  "patient_id" TEXT,
  "patient_name" TEXT NOT NULL,
  "phone_number" TEXT NOT NULL,
  "email" TEXT,

  "call_context" JSONB,

  "status" "OutboundCallStatus" NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),

  "retell_call_id" TEXT,
  "outcome" TEXT,
  "call_duration_sec" INTEGER,
  "summary" TEXT,
  "sentiment" TEXT,
  "analysis_data" JSONB,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "campaign_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campaign_contacts_campaign_id_phone_number_key" ON "campaign_contacts"("campaign_id", "phone_number");
CREATE INDEX "campaign_contacts_campaign_id_idx" ON "campaign_contacts"("campaign_id");
CREATE INDEX "campaign_contacts_status_idx" ON "campaign_contacts"("status");
CREATE INDEX "campaign_contacts_patient_id_idx" ON "campaign_contacts"("patient_id");
CREATE INDEX "campaign_contacts_campaign_id_status_idx" ON "campaign_contacts"("campaign_id", "status");

ALTER TABLE "campaign_contacts"
  ADD CONSTRAINT "campaign_contacts_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "outbound_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- OutboundAgentTemplate
-- ============================================================================

CREATE TABLE "outbound_agent_templates" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "agent_group" "OutboundAgentGroup" NOT NULL,
  "name" TEXT NOT NULL,

  "retell_agent_id" TEXT,
  "flow_config" JSONB NOT NULL,
  "prompt_templates" JSONB NOT NULL,
  "voicemail_messages" JSONB NOT NULL,
  "sms_templates" JSONB,
  "email_templates" JSONB,

  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "version" TEXT NOT NULL DEFAULT 'v1.0',

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "outbound_agent_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbound_agent_templates_agent_group_key" ON "outbound_agent_templates"("agent_group");

-- ============================================================================
-- OutboundSettings
-- ============================================================================

CREATE TABLE "outbound_settings" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "account_id" TEXT NOT NULL,

  "patient_care_enabled" BOOLEAN NOT NULL DEFAULT false,
  "financial_enabled" BOOLEAN NOT NULL DEFAULT false,

  "calling_window_start" TEXT NOT NULL DEFAULT '09:00',
  "calling_window_end" TEXT NOT NULL DEFAULT '17:00',
  "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
  "max_concurrent_calls" INTEGER NOT NULL DEFAULT 1,
  "from_phone_number_id" TEXT,

  "channel_defaults" JSONB NOT NULL DEFAULT '{}',

  "follow_up_config" JSONB NOT NULL DEFAULT '{}',
  "reactivation_config" JSONB NOT NULL DEFAULT '{}',
  "reminder_config" JSONB NOT NULL DEFAULT '{}',

  "leave_voicemail" BOOLEAN NOT NULL DEFAULT true,

  "max_retries" INTEGER NOT NULL DEFAULT 3,
  "retry_delay_minutes" INTEGER NOT NULL DEFAULT 120,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "outbound_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbound_settings_account_id_key" ON "outbound_settings"("account_id");

ALTER TABLE "outbound_settings"
  ADD CONSTRAINT "outbound_settings_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- DoNotCallEntry
-- ============================================================================

CREATE TABLE "do_not_call_list" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "account_id" TEXT NOT NULL,
  "phone_number" TEXT NOT NULL,
  "reason" TEXT,
  "source" TEXT,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "do_not_call_list_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "do_not_call_list_account_id_phone_number_key" ON "do_not_call_list"("account_id", "phone_number");
CREATE INDEX "do_not_call_list_account_id_idx" ON "do_not_call_list"("account_id");

ALTER TABLE "do_not_call_list"
  ADD CONSTRAINT "do_not_call_list_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
