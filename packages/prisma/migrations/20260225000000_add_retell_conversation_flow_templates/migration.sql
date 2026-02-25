-- CreateTable
CREATE TABLE "retell_conversation_flow_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "global_prompt" TEXT NOT NULL,
    "node_prompts" JSONB NOT NULL,
    "node_tools" JSONB NOT NULL,
    "edge_config" JSONB NOT NULL,
    "model_config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "retell_conversation_flow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retell_conversation_flow_templates_name_key" ON "retell_conversation_flow_templates"("name");

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "retell_flow_template_id" TEXT;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_retell_flow_template_id_fkey" FOREIGN KEY ("retell_flow_template_id") REFERENCES "retell_conversation_flow_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
