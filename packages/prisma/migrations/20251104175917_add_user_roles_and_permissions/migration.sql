-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('account_manager', 'employee');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppPermission" ADD VALUE 'campaigns.view';
ALTER TYPE "AppPermission" ADD VALUE 'campaigns.create';
ALTER TYPE "AppPermission" ADD VALUE 'campaigns.edit';
ALTER TYPE "AppPermission" ADD VALUE 'campaigns.delete';
ALTER TYPE "AppPermission" ADD VALUE 'ads.view';
ALTER TYPE "AppPermission" ADD VALUE 'ads.create';
ALTER TYPE "AppPermission" ADD VALUE 'ads.edit';
ALTER TYPE "AppPermission" ADD VALUE 'ads.delete';
ALTER TYPE "AppPermission" ADD VALUE 'analytics.view';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'account_manager';

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
