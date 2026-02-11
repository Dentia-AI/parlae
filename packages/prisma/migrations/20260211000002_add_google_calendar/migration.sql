-- AlterTable
ALTER TABLE "accounts"
ADD COLUMN "google_calendar_connected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "google_calendar_access_token" TEXT,
ADD COLUMN "google_calendar_refresh_token" TEXT,
ADD COLUMN "google_calendar_token_expiry" TIMESTAMP(3),
ADD COLUMN "google_calendar_id" TEXT,
ADD COLUMN "google_calendar_email" TEXT;
