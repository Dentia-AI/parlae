import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'crypto';

export interface AuditLogEntry {
  pmsIntegrationId: string;
  action: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  userId?: string;
  vapiCallId?: string;
  ipAddress?: string;
  requestSummary?: string;
  responseStatus: number;
  responseTime: number;
  phiAccessed: boolean;
  phiFields?: string[];
  errorMessage?: string;
}

/**
 * HIPAA-compliant audit logging service
 * Logs all access to Protected Health Information (PHI)
 */
@Injectable()
export class HipaaAuditService {
  private readonly logger = new Logger(HipaaAuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Log PHI access for HIPAA compliance
   * Must be called for every patient data access
   */
  async logAccess(entry: AuditLogEntry): Promise<void> {
    try {
      // DON'T log PHI content - only log that it was accessed
      await this.prisma.$executeRaw`
        INSERT INTO "pms_audit_logs" (
          "id",
          "pms_integration_id",
          "action",
          "endpoint",
          "method",
          "user_id",
          "vapi_call_id",
          "ip_address",
          "request_summary",
          "response_status",
          "response_time",
          "phi_accessed",
          "phi_fields",
          "error_message",
          "created_at"
        ) VALUES (
          ${randomUUID()},
          ${entry.pmsIntegrationId},
          ${entry.action},
          ${entry.endpoint},
          ${entry.method},
          ${entry.userId || null},
          ${entry.vapiCallId || null},
          ${entry.ipAddress || null},
          ${entry.requestSummary || null},
          ${entry.responseStatus},
          ${entry.responseTime},
          ${entry.phiAccessed},
          ${entry.phiFields || []},
          ${entry.errorMessage || null},
          NOW()
        )
      `;

      // Log to application logs (NO PHI!)
      this.logger.log({
        message: 'PHI access logged',
        pmsIntegrationId: entry.pmsIntegrationId,
        action: entry.action,
        phiAccessed: entry.phiAccessed,
        phiFieldsCount: entry.phiFields?.length || 0,
        // NEVER log patient data here!
      });
    } catch (error: any) {
      // CRITICAL: If audit logging fails, we MUST know about it
      this.logger.error(`HIPAA audit logging failed: ${error.message}`, error.stack);
      // In production, this should trigger an alert
      throw error;
    }
  }

  /**
   * Get audit logs for compliance reporting
   * This is what you show during HIPAA audits
   */
  async getAuditLogs(filters: {
    pmsIntegrationId?: string;
    startDate?: Date;
    endDate?: Date;
    phiAccessedOnly?: boolean;
  }) {
    const where: any = {};

    if (filters.pmsIntegrationId) {
      where.pms_integration_id = filters.pmsIntegrationId;
    }

    if (filters.startDate || filters.endDate) {
      where.created_at = {};
      if (filters.startDate) where.created_at.gte = filters.startDate;
      if (filters.endDate) where.created_at.lte = filters.endDate;
    }

    if (filters.phiAccessedOnly) {
      where.phi_accessed = true;
    }

    const logs = await this.prisma.$queryRaw`
      SELECT * FROM "pms_audit_logs"
      WHERE ${where}
      ORDER BY "created_at" DESC
      LIMIT 1000
    `;

    return logs;
  }
}
