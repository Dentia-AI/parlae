-- CreateTable: retell_agent_templates
CREATE TABLE IF NOT EXISTS "retell_agent_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "llm_configs" JSONB NOT NULL,
    "agent_configs" JSONB NOT NULL,
    "swap_config" JSONB NOT NULL,
    "tools_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "retell_agent_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
DO $$ BEGIN
  CREATE UNIQUE INDEX "retell_agent_templates_name_key" ON "retell_agent_templates"("name");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Add retell_agent_template_id column to accounts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'retell_agent_template_id'
  ) THEN
    ALTER TABLE "accounts" ADD COLUMN "retell_agent_template_id" TEXT;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "accounts"
    ADD CONSTRAINT "accounts_retell_agent_template_id_fkey"
    FOREIGN KEY ("retell_agent_template_id")
    REFERENCES "retell_agent_templates"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
