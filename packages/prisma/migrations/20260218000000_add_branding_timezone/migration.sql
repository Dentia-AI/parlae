-- ============================================================================
-- Migration: add_branding_timezone + cleanup stale constraints
-- 
-- This migration:
-- 1. Adds the branding_timezone column to accounts
-- 2. Drops the stale vapi_phone_numbers_one_link CHECK constraint
--    (references legacy columns squad_template_id/assistant_template_id
--     that are no longer used by the Prisma schema)
-- 3. Drops stale foreign keys on vapi_phone_numbers that reference
--    dropped tables (vapi_squad_templates, vapi_assistant_templates)
--
-- All operations are IDEMPOTENT — safe to run on any DB state.
-- ============================================================================

-- 1. Add branding_timezone column to accounts
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "branding_timezone" TEXT;

-- 2. Drop the stale CHECK constraint that blocks vapiPhoneNumber.upsert()
--    This constraint was created in 20260131 and requires squad_template_id OR
--    assistant_template_id to be non-null, but those columns are no longer
--    part of the Prisma schema and are always null.
DO $$ BEGIN
  ALTER TABLE "vapi_phone_numbers" DROP CONSTRAINT IF EXISTS "vapi_phone_numbers_one_link";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 3. Drop stale foreign keys referencing old tables
--    These FKs were created in 20260131 referencing vapi_squad_templates and
--    vapi_assistant_templates which have since been superseded.
DO $$ BEGIN
  ALTER TABLE "vapi_phone_numbers" DROP CONSTRAINT IF EXISTS "vapi_phone_numbers_squad_template_id_fkey";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vapi_phone_numbers" DROP CONSTRAINT IF EXISTS "vapi_phone_numbers_assistant_template_id_fkey";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
