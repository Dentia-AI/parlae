-- Remove PHI columns from campaign_contacts table
-- patientName and email are no longer stored; patient data is resolved from PMS at display time.
-- patientId becomes required (NOT NULL); phoneNumber becomes optional.

-- Step 1: Back-fill any NULL patient_id values so the NOT NULL constraint succeeds
UPDATE campaign_contacts SET patient_id = 'unknown-' || id WHERE patient_id IS NULL;

-- Step 2: Drop PHI columns
ALTER TABLE "campaign_contacts" DROP COLUMN IF EXISTS "patient_name";
ALTER TABLE "campaign_contacts" DROP COLUMN IF EXISTS "email";

-- Step 3: Make patient_id NOT NULL
ALTER TABLE "campaign_contacts" ALTER COLUMN "patient_id" SET NOT NULL;

-- Step 4: Make phone_number nullable (already was in some envs, ensure consistency)
ALTER TABLE "campaign_contacts" ALTER COLUMN "phone_number" DROP NOT NULL;
