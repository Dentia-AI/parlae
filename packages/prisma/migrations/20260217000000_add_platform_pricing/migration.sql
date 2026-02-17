-- CreateTable
CREATE TABLE IF NOT EXISTS "platform_pricing" (
    "id" SERIAL NOT NULL,
    "twilio_inbound_per_min" DOUBLE PRECISION NOT NULL DEFAULT 0.0085,
    "twilio_outbound_per_min" DOUBLE PRECISION NOT NULL DEFAULT 0.014,
    "server_cost_per_min" DOUBLE PRECISION NOT NULL DEFAULT 0.005,
    "markup_percent" DOUBLE PRECISION NOT NULL DEFAULT 30.0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,

    CONSTRAINT "platform_pricing_pkey" PRIMARY KEY ("id")
);

-- Seed the single config row with defaults
INSERT INTO "platform_pricing" ("twilio_inbound_per_min", "twilio_outbound_per_min", "server_cost_per_min", "markup_percent", "updated_at")
VALUES (0.0085, 0.014, 0.005, 30.0, NOW())
ON CONFLICT DO NOTHING;
