-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "stripe_payment_method_id" TEXT;
ALTER TABLE "accounts" ADD COLUMN "payment_method_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "accounts" ADD COLUMN "payment_method_verified_at" TIMESTAMP(3);

-- Add comment
COMMENT ON COLUMN "accounts"."stripe_payment_method_id" IS 'Stripe payment method ID for phone number charges';
COMMENT ON COLUMN "accounts"."payment_method_verified" IS 'Whether payment method is verified and can be used for purchases';
COMMENT ON COLUMN "accounts"."payment_method_verified_at" IS 'When payment method was verified';
