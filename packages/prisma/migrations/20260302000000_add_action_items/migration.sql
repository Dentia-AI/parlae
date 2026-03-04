-- CreateEnum
CREATE TYPE "ActionItemStatus" AS ENUM ('open', 'in_progress', 'resolved');

-- CreateEnum
CREATE TYPE "ActionItemReason" AS ENUM ('follow_up_required', 'transfer_failed', 'no_resolution', 'emergency', 'caller_hung_up', 'call_error', 'voicemail_review');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('inbound', 'outbound');

-- CreateTable
CREATE TABLE "action_items" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "provider" "VoiceProvider" NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "reason" "ActionItemReason" NOT NULL,
    "status" "ActionItemStatus" NOT NULL DEFAULT 'open'::"ActionItemStatus",
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "summary" TEXT,
    "agent_notes" TEXT,
    "staff_notes" TEXT,
    "assigned_to_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_user_id" TEXT,
    "campaign_id" TEXT,
    "call_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_items_account_id_status_idx" ON "action_items"("account_id", "status");

-- CreateIndex
CREATE INDEX "action_items_account_id_direction_idx" ON "action_items"("account_id", "direction");

-- CreateIndex
CREATE INDEX "action_items_created_at_idx" ON "action_items"("created_at");

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
