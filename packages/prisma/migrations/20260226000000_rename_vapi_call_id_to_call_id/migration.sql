-- Rename vapi_call_id to call_id in call_references and pms_audit_logs
-- These columns store call IDs from both Vapi and Retell (provider-agnostic)

ALTER TABLE "call_references" RENAME COLUMN "vapi_call_id" TO "call_id";
ALTER TABLE "pms_audit_logs" RENAME COLUMN "vapi_call_id" TO "call_id";
