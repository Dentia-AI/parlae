-- Add branding fields to Account table
ALTER TABLE "accounts" 
ADD COLUMN IF NOT EXISTS "branding_logo_url" TEXT,
ADD COLUMN IF NOT EXISTS "branding_primary_color" VARCHAR(7),
ADD COLUMN IF NOT EXISTS "branding_business_name" TEXT,
ADD COLUMN IF NOT EXISTS "branding_contact_email" TEXT,
ADD COLUMN IF NOT EXISTS "branding_contact_phone" TEXT,
ADD COLUMN IF NOT EXISTS "branding_address" TEXT,
ADD COLUMN IF NOT EXISTS "branding_website" TEXT,
ADD COLUMN IF NOT EXISTS "twilio_messaging_service_sid" TEXT;

-- Add comment to document the branding fields
COMMENT ON COLUMN "accounts"."branding_logo_url" IS 'URL to clinic logo for email templates';
COMMENT ON COLUMN "accounts"."branding_primary_color" IS 'Primary brand color (hex code) for emails';
COMMENT ON COLUMN "accounts"."branding_business_name" IS 'Business name for customer-facing communications';
COMMENT ON COLUMN "accounts"."branding_contact_email" IS 'Contact email for patient communications';
COMMENT ON COLUMN "accounts"."branding_contact_phone" IS 'Contact phone number for patient communications';
COMMENT ON COLUMN "accounts"."branding_address" IS 'Physical address for email footers';
COMMENT ON COLUMN "accounts"."branding_website" IS 'Website URL for email footers';
COMMENT ON COLUMN "accounts"."twilio_messaging_service_sid" IS 'Twilio Messaging Service SID for SMS';
