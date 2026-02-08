-- CreateEnum
CREATE TYPE "GhlSubAccountStatus" AS ENUM ('pending', 'active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "VoiceAgentStatus" AS ENUM ('draft', 'active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "KnowledgeBaseSource" AS ENUM ('upload', 'url', 'text');

-- CreateTable
CREATE TABLE "ghl_sub_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT,
    "ghl_location_id" TEXT NOT NULL,
    "ghl_company_id" TEXT,
    "business_name" TEXT NOT NULL,
    "business_email" TEXT,
    "business_phone" TEXT,
    "business_address" TEXT,
    "business_website" TEXT,
    "timezone" TEXT,
    "industry" TEXT,
    "status" "GhlSubAccountStatus" NOT NULL DEFAULT 'pending',
    "setup_completed" BOOLEAN NOT NULL DEFAULT false,
    "setup_step" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "ghl_sub_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_agents" (
    "id" TEXT NOT NULL,
    "sub_account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ghl_agent_id" TEXT,
    "voice_id" TEXT NOT NULL,
    "voice_name" TEXT,
    "phone_number" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "prompt" TEXT NOT NULL,
    "personality" TEXT,
    "greeting_message" TEXT,
    "business_hours" JSONB,
    "timezone" TEXT,
    "workflows" JSONB,
    "post_call_actions" JSONB,
    "in_call_actions" JSONB,
    "custom_fields" JSONB,
    "webhook_config" JSONB,
    "status" "VoiceAgentStatus" NOT NULL DEFAULT 'draft',
    "is_deployed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deployed_at" TIMESTAMP(3),
    "last_call_at" TIMESTAMP(3),

    CONSTRAINT "voice_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_base" (
    "id" TEXT NOT NULL,
    "voice_agent_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" "KnowledgeBaseSource" NOT NULL,
    "source_url" TEXT,
    "file_url" TEXT,
    "file_name" TEXT,
    "file_size" INTEGER,
    "ghl_resource_id" TEXT,
    "is_processed" BOOLEAN NOT NULL DEFAULT false,
    "processing_error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "voice_agent_id" TEXT NOT NULL,
    "ghl_call_id" TEXT,
    "phone_number" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "duration" INTEGER,
    "status" TEXT NOT NULL,
    "transcript" TEXT,
    "summary" TEXT,
    "recording_url" TEXT,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "lead_captured" BOOLEAN NOT NULL DEFAULT false,
    "appointment_set" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "actions" JSONB,
    "call_started_at" TIMESTAMP(3) NOT NULL,
    "call_ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ghl_sub_accounts_ghl_location_id_key" ON "ghl_sub_accounts"("ghl_location_id");

-- CreateIndex
CREATE INDEX "ghl_sub_accounts_user_id_idx" ON "ghl_sub_accounts"("user_id");

-- CreateIndex
CREATE INDEX "ghl_sub_accounts_account_id_idx" ON "ghl_sub_accounts"("account_id");

-- CreateIndex
CREATE INDEX "ghl_sub_accounts_ghl_location_id_idx" ON "ghl_sub_accounts"("ghl_location_id");

-- CreateIndex
CREATE INDEX "ghl_sub_accounts_status_idx" ON "ghl_sub_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "voice_agents_ghl_agent_id_key" ON "voice_agents"("ghl_agent_id");

-- CreateIndex
CREATE INDEX "voice_agents_sub_account_id_idx" ON "voice_agents"("sub_account_id");

-- CreateIndex
CREATE INDEX "voice_agents_status_idx" ON "voice_agents"("status");

-- CreateIndex
CREATE INDEX "voice_agents_phone_number_idx" ON "voice_agents"("phone_number");

-- CreateIndex
CREATE INDEX "knowledge_base_voice_agent_id_idx" ON "knowledge_base"("voice_agent_id");

-- CreateIndex
CREATE INDEX "knowledge_base_source_idx" ON "knowledge_base"("source");

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_ghl_call_id_key" ON "call_logs"("ghl_call_id");

-- CreateIndex
CREATE INDEX "call_logs_voice_agent_id_idx" ON "call_logs"("voice_agent_id");

-- CreateIndex
CREATE INDEX "call_logs_call_started_at_idx" ON "call_logs"("call_started_at");

-- CreateIndex
CREATE INDEX "call_logs_phone_number_idx" ON "call_logs"("phone_number");

-- AddForeignKey
ALTER TABLE "ghl_sub_accounts" ADD CONSTRAINT "ghl_sub_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ghl_sub_accounts" ADD CONSTRAINT "ghl_sub_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_agents" ADD CONSTRAINT "voice_agents_sub_account_id_fkey" FOREIGN KEY ("sub_account_id") REFERENCES "ghl_sub_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_voice_agent_id_fkey" FOREIGN KEY ("voice_agent_id") REFERENCES "voice_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_voice_agent_id_fkey" FOREIGN KEY ("voice_agent_id") REFERENCES "voice_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


