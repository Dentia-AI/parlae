-- CreateTable
CREATE TABLE "ai_action_logs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "call_id" TEXT,
    "external_resource_id" TEXT,
    "external_resource_type" TEXT,
    "appointment_time" TEXT,
    "appointment_type" TEXT,
    "provider_name" TEXT,
    "duration" INTEGER,
    "summary" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "error_message" TEXT,
    "pms_provider" TEXT,
    "writeback_id" TEXT,
    "calendar_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_action_logs_account_id_created_at_idx" ON "ai_action_logs"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_action_logs_call_id_idx" ON "ai_action_logs"("call_id");

-- CreateIndex
CREATE INDEX "ai_action_logs_source_action_idx" ON "ai_action_logs"("source", "action");

-- AddForeignKey
ALTER TABLE "ai_action_logs" ADD CONSTRAINT "ai_action_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
