-- Quick fix: Manually enable pgvector extension and remove failed migration entry
-- Run this if you have production database access via bastion

-- 1. Enable the pgvector extension first
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Remove the failed migration record so it can be reapplied
DELETE FROM "_prisma_migrations" 
WHERE migration_name = '20251123_add_embeddings_to_source_content';

-- Now you can run: ./scripts/deploy-production-migrations-via-bastion.sh
-- The migrations will run in correct order:
--   1. 20251123000000_add_pgvector_extension (already done manually above)
--   2. 20251123000001_add_embeddings_to_source_content (will now succeed)

