-- Fix failed migration: Mark as rolled back so it can be re-applied
-- Run this manually or via prisma migrate resolve

-- Option 1: Mark the failed migration as rolled back
UPDATE _prisma_migrations 
SET rolled_back_at = NOW()
WHERE migration_name = '20260212000001_make_shaun_super_admin'
  AND finished_at IS NULL;

-- Option 2: Delete the failed migration record (if you want to re-apply from scratch)
-- DELETE FROM _prisma_migrations 
-- WHERE migration_name = '20260212000001_make_shaun_super_admin';
