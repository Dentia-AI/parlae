-- HIPAA Audit Log Table
-- Tracks all access to Protected Health Information (PHI)

CREATE TABLE IF NOT EXISTS "pms_audit_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pms_integration_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "user_id" TEXT,
  "vapi_call_id" TEXT,
  "ip_address" TEXT,
  "request_summary" TEXT,
  "response_status" INTEGER NOT NULL,
  "response_time" INTEGER NOT NULL,
  "phi_accessed" BOOLEAN NOT NULL DEFAULT false,
  "phi_fields" TEXT[],
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT "pms_audit_logs_pms_integration_id_fkey" 
    FOREIGN KEY ("pms_integration_id") 
    REFERENCES "pms_integrations"("id") ON DELETE CASCADE
);

CREATE INDEX "pms_audit_logs_pms_integration_id_idx" ON "pms_audit_logs"("pms_integration_id");
CREATE INDEX "pms_audit_logs_created_at_idx" ON "pms_audit_logs"("created_at");
CREATE INDEX "pms_audit_logs_phi_accessed_idx" ON "pms_audit_logs"("phi_accessed");
CREATE INDEX "pms_audit_logs_vapi_call_id_idx" ON "pms_audit_logs"("vapi_call_id");

COMMENT ON TABLE "pms_audit_logs" IS 'HIPAA-compliant audit log for all PHI access';
COMMENT ON COLUMN "pms_audit_logs"."phi_accessed" IS 'Whether this request accessed Protected Health Information';
COMMENT ON COLUMN "pms_audit_logs"."phi_fields" IS 'List of PHI fields accessed (name, phone, email, dob, ssn, etc.)';
