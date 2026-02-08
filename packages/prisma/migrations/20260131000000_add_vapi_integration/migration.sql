-- Vapi AI Integration Schema
-- Purpose: Manage preset squads/assistants and link them to accounts

-- ================================
-- ENUMS
-- ================================

-- Status for AI assistants and squads
CREATE TYPE "VapiEntityStatus" AS ENUM ('active', 'inactive', 'archived');

-- Type of AI assistant
CREATE TYPE "VapiAssistantType" AS ENUM ('triage', 'scheduler', 'emergency', 'sales', 'support', 'custom');

-- Type of squad template
CREATE TYPE "VapiSquadType" AS ENUM ('dental_clinic', 'sales_pipeline', 'support_triage', 'custom');

-- Phone number status
CREATE TYPE "VapiPhoneStatus" AS ENUM ('active', 'inactive', 'pending');

-- ================================
-- PRESET SQUADS (Created Once, Shared by All)
-- ================================

-- Predefined squad templates that accounts can use
CREATE TABLE "vapi_squad_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "squad_type" "VapiSquadType" NOT NULL,
    
    -- Vapi IDs
    "vapi_squad_id" TEXT UNIQUE, -- Vapi's squad ID
    
    -- Configuration (JSON)
    "config" JSONB NOT NULL, -- Squad configuration
    "knowledge_base_template" JSONB, -- Template for knowledge base
    "tools_config" JSONB, -- Tool definitions
    
    -- Status
    "status" "VapiEntityStatus" NOT NULL DEFAULT 'active',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "vapi_squad_templates_pkey" PRIMARY KEY ("id")
);

-- ================================
-- PRESET ASSISTANTS (Created Once, Shared by All)
-- ================================

-- Predefined assistant templates
CREATE TABLE "vapi_assistant_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "assistant_type" "VapiAssistantType" NOT NULL,
    
    -- Vapi IDs
    "vapi_assistant_id" TEXT UNIQUE, -- Vapi's assistant ID
    
    -- Voice Configuration
    "voice_provider" TEXT NOT NULL, -- 'elevenlabs', 'playht', etc.
    "voice_id" TEXT NOT NULL,
    "voice_name" TEXT,
    
    -- Model Configuration
    "model_provider" TEXT NOT NULL, -- 'openai', 'anthropic'
    "model_name" TEXT NOT NULL, -- 'gpt-4o', 'claude-3'
    "system_prompt" TEXT NOT NULL,
    "first_message" TEXT,
    
    -- Configuration (JSON)
    "config" JSONB NOT NULL, -- Full assistant config
    "tools" JSONB, -- Tool definitions
    
    -- Status
    "status" "VapiEntityStatus" NOT NULL DEFAULT 'active',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "vapi_assistant_templates_pkey" PRIMARY KEY ("id")
);

-- ================================
-- ACCOUNT-SPECIFIC PHONE NUMBERS
-- ================================

-- Phone numbers assigned to accounts
CREATE TABLE "vapi_phone_numbers" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    
    -- Phone Number Info
    "phone_number" TEXT NOT NULL UNIQUE, -- E.164 format
    "friendly_name" TEXT,
    "area_code" TEXT,
    "country_code" TEXT NOT NULL DEFAULT 'US',
    
    -- Provider IDs
    "twilio_phone_sid" TEXT UNIQUE, -- Twilio phone SID
    "twilio_account_sid" TEXT, -- Which Twilio account/sub-account
    "vapi_phone_id" TEXT UNIQUE, -- Vapi phone number ID
    
    -- Linked Entity (Squad OR Assistant - not both)
    "squad_template_id" TEXT, -- Links to preset squad
    "assistant_template_id" TEXT, -- Links to preset assistant
    "use_account_knowledge" BOOLEAN NOT NULL DEFAULT true, -- Use account-specific knowledge base
    
    -- Custom Configuration
    "custom_config" JSONB, -- Account-specific overrides
    
    -- Status
    "status" "VapiPhoneStatus" NOT NULL DEFAULT 'active',
    "is_primary" BOOLEAN NOT NULL DEFAULT false, -- Primary number for account
    
    -- Usage Stats
    "total_calls" INTEGER NOT NULL DEFAULT 0,
    "total_minutes" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "last_call_at" TIMESTAMP(3),
    
    -- Timestamps
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activated_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),

    CONSTRAINT "vapi_phone_numbers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vapi_phone_numbers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
    CONSTRAINT "vapi_phone_numbers_squad_template_id_fkey" FOREIGN KEY ("squad_template_id") REFERENCES "vapi_squad_templates"("id") ON DELETE SET NULL,
    CONSTRAINT "vapi_phone_numbers_assistant_template_id_fkey" FOREIGN KEY ("assistant_template_id") REFERENCES "vapi_assistant_templates"("id") ON DELETE SET NULL,
    -- Ensure only one is set
    CONSTRAINT "vapi_phone_numbers_one_link" CHECK (
        (squad_template_id IS NOT NULL AND assistant_template_id IS NULL) OR
        (squad_template_id IS NULL AND assistant_template_id IS NOT NULL)
    )
);

-- ================================
-- ACCOUNT KNOWLEDGE BASE
-- ================================

-- Account-specific knowledge base content
CREATE TABLE "vapi_account_knowledge" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    
    -- Content
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source_type" TEXT NOT NULL, -- 'manual', 'url', 'file'
    "source_url" TEXT,
    "file_name" TEXT,
    
    -- Vapi IDs
    "vapi_file_id" TEXT UNIQUE, -- Vapi's file ID
    
    -- Processing
    "is_processed" BOOLEAN NOT NULL DEFAULT false,
    "processing_error" TEXT,
    
    -- Metadata
    "metadata" JSONB,
    
    -- Timestamps
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vapi_account_knowledge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vapi_account_knowledge_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE
);

-- ================================
-- CALL LOGS
-- ================================

-- Logs of all Vapi calls
CREATE TABLE "vapi_call_logs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    
    -- Call Information
    "vapi_call_id" TEXT UNIQUE NOT NULL, -- Vapi's call ID
    "from_number" TEXT,
    "to_number" TEXT,
    "direction" TEXT, -- 'inbound', 'outbound'
    
    -- Duration
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    
    -- Content
    "transcript" TEXT,
    "summary" TEXT,
    "recording_url" TEXT,
    
    -- Analysis (Extracted Data)
    "analysis" JSONB, -- Structured data extracted
    "sentiment" TEXT, -- 'positive', 'negative', 'neutral'
    
    -- Cost
    "cost_cents" INTEGER, -- Cost in cents
    
    -- Status
    "call_status" TEXT, -- 'completed', 'failed', 'no-answer'
    "error_message" TEXT,
    
    -- Metadata
    "metadata" JSONB,
    
    -- Timestamps
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vapi_call_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vapi_call_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
    CONSTRAINT "vapi_call_logs_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "vapi_phone_numbers"("id") ON DELETE CASCADE
);

-- ================================
-- INDEXES
-- ================================

-- Squad Templates
CREATE INDEX "vapi_squad_templates_type_idx" ON "vapi_squad_templates"("squad_type");
CREATE INDEX "vapi_squad_templates_status_idx" ON "vapi_squad_templates"("status");

-- Assistant Templates
CREATE INDEX "vapi_assistant_templates_type_idx" ON "vapi_assistant_templates"("assistant_type");
CREATE INDEX "vapi_assistant_templates_status_idx" ON "vapi_assistant_templates"("status");

-- Phone Numbers
CREATE INDEX "vapi_phone_numbers_account_id_idx" ON "vapi_phone_numbers"("account_id");
CREATE INDEX "vapi_phone_numbers_status_idx" ON "vapi_phone_numbers"("status");
CREATE INDEX "vapi_phone_numbers_squad_template_id_idx" ON "vapi_phone_numbers"("squad_template_id");
CREATE INDEX "vapi_phone_numbers_assistant_template_id_idx" ON "vapi_phone_numbers"("assistant_template_id");

-- Account Knowledge
CREATE INDEX "vapi_account_knowledge_account_id_idx" ON "vapi_account_knowledge"("account_id");

-- Call Logs
CREATE INDEX "vapi_call_logs_account_id_idx" ON "vapi_call_logs"("account_id");
CREATE INDEX "vapi_call_logs_phone_number_id_idx" ON "vapi_call_logs"("phone_number_id");
CREATE INDEX "vapi_call_logs_started_at_idx" ON "vapi_call_logs"("started_at");
CREATE INDEX "vapi_call_logs_vapi_call_id_idx" ON "vapi_call_logs"("vapi_call_id");

-- ================================
-- SEED DATA: Preset Squad Templates
-- ================================

-- Dental Clinic Squad
INSERT INTO "vapi_squad_templates" ("id", "name", "display_name", "description", "squad_type", "config", "status", "is_default", "created_at", "updated_at")
VALUES (
    'squad_dental_clinic',
    'dental-clinic',
    'Dental Clinic (Triage + Emergency + Scheduler)',
    'Complete dental clinic workflow with triage, emergency handling, and appointment scheduling',
    'dental_clinic',
    '{"members": 3, "tools": ["checkAvailability", "bookAppointment"], "knowledgeBaseRequired": true}',
    'active',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Sales Pipeline Squad
INSERT INTO "vapi_squad_templates" ("id", "name", "display_name", "description", "squad_type", "config", "status", "is_default", "created_at", "updated_at")
VALUES (
    'squad_sales_pipeline',
    'sales-pipeline',
    'Sales Pipeline (Qualifier + Demo + Account Manager)',
    'Complete sales workflow with lead qualification, demo scheduling, and account management',
    'sales_pipeline',
    '{"members": 3, "tools": ["scheduleDemo", "qualifyLead"], "knowledgeBaseRequired": true}',
    'active',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Support Triage Squad
INSERT INTO "vapi_squad_templates" ("id", "name", "display_name", "description", "squad_type", "config", "status", "is_default", "created_at", "updated_at")
VALUES (
    'squad_support_triage',
    'support-triage',
    'Support Triage (L1 + L2 + Engineering)',
    'Technical support workflow with multi-level escalation',
    'support_triage',
    '{"members": 3, "tools": ["createTicket", "escalateIssue"], "knowledgeBaseRequired": true}',
    'active',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- ================================
-- SEED DATA: Preset Assistant Templates
-- ================================

-- Customer Support Assistant
INSERT INTO "vapi_assistant_templates" ("id", "name", "display_name", "description", "assistant_type", "vapi_assistant_id", "voice_provider", "voice_id", "voice_name", "model_provider", "model_name", "system_prompt", "first_message", "config", "status", "is_default", "created_at", "updated_at")
VALUES (
    'asst_customer_support',
    'customer-support',
    'Customer Support Agent',
    'General purpose customer support assistant',
    'support',
    NULL, -- Will be set after creating in Vapi
    'elevenlabs',
    '21m00Tcm4TlvDq8ikWAM',
    'Rachel',
    'openai',
    'gpt-4o',
    'You are a helpful customer support agent. Be professional, empathetic, and solve customer issues efficiently.',
    'Thank you for calling! How can I help you today?',
    '{"temperature": 0.7, "maxTokens": 500, "recordingEnabled": true}',
    'active',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Sales Agent Assistant
INSERT INTO "vapi_assistant_templates" ("id", "name", "display_name", "description", "assistant_type", "vapi_assistant_id", "voice_provider", "voice_id", "voice_name", "model_provider", "model_name", "system_prompt", "first_message", "config", "status", "is_default", "created_at", "updated_at")
VALUES (
    'asst_sales_agent',
    'sales-agent',
    'Sales Agent',
    'Friendly sales assistant for qualifying leads',
    'sales',
    NULL,
    'elevenlabs',
    'EXAVITQu4vr4xnSDxMaL',
    'Bella',
    'openai',
    'gpt-4o',
    'You are a friendly sales agent. Qualify leads, understand their needs, and schedule demos when appropriate.',
    'Hi! Thanks for your interest. I''d love to learn more about your needs.',
    '{"temperature": 0.8, "maxTokens": 500, "recordingEnabled": true}',
    'active',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
