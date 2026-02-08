-- Add new roles to UserRole enum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'super_admin';

-- Create AdminAccess table
CREATE TABLE "admin_access" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "admin_id" TEXT NOT NULL,
    "granted_by_user_id" TEXT NOT NULL,
    "account_id" TEXT,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "notes" TEXT,
    CONSTRAINT "admin_access_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "admin_access_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "admin_access_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create ImpersonationSession table
CREATE TABLE "impersonation_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "admin_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "account_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "session_token" TEXT NOT NULL UNIQUE,
    "auto_revoke_access" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "impersonation_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "impersonation_sessions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "impersonation_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes for AdminAccess
CREATE INDEX "admin_access_admin_id_is_revoked_idx" ON "admin_access"("admin_id", "is_revoked");
CREATE INDEX "admin_access_account_id_idx" ON "admin_access"("account_id");

-- Create indexes for ImpersonationSession
CREATE INDEX "impersonation_sessions_admin_id_is_active_idx" ON "impersonation_sessions"("admin_id", "is_active");
CREATE INDEX "impersonation_sessions_target_user_id_idx" ON "impersonation_sessions"("target_user_id");
CREATE INDEX "impersonation_sessions_session_token_idx" ON "impersonation_sessions"("session_token");

