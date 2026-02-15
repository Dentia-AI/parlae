-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "stripe_customer_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "accounts_stripe_customer_id_key" ON "accounts"("stripe_customer_id");
