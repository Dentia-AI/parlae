-- CreateTable
CREATE TABLE "agent_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "squad_config" JSONB NOT NULL,
    "assistant_config" JSONB NOT NULL,
    "tools_config" JSONB,
    "model_config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT
);

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "agent_template_id" TEXT;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_agent_template_id_fkey" 
    FOREIGN KEY ("agent_template_id") REFERENCES "agent_templates"("id") 
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index for performance
CREATE INDEX "agent_templates_category_idx" ON "agent_templates"("category");
CREATE INDEX "agent_templates_is_default_idx" ON "agent_templates"("is_default");
