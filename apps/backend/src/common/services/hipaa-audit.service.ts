import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'crypto';

export interface AuditLogEntry {
  pmsIntegrationId: string;
  action: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  userId?: string;
  callId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestSummary?: string;
  responseStatus: number;
  responseTime: number;
  phiAccessed: boolean;
  patientId?: string;
  success?: boolean;
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
      await this.prisma.$executeRaw`
        INSERT INTO "pms_audit_logs" (
          "id",
          "pms_integration_id",
          "action",
          "endpoint",
          "method",
          "user_id",
          "call_id",
          "ip_address",
          "user_agent",
          "request_summary",
          "response_status",
          "response_time",
          "phi_accessed",
          "patient_id",
          "success",
          "error_message",
          "created_at"
        ) VALUES (
          ${randomUUID()},
          ${entry.pmsIntegrationId},
          ${entry.action},
          ${entry.endpoint},
          ${entry.method},
          ${entry.userId || null},
          ${entry.callId || null},
          ${entry.ipAddress || null},
          ${entry.userAgent || null},
          ${entry.requestSummary || null},
          ${entry.responseStatus},
          ${entry.responseTime},
          ${entry.phiAccessed},
          ${entry.patientId || null},
          ${entry.success !== false},
          ${entry.errorMessage || null},
          NOW()
        )
      `;

      this.logger.log({
        msg: 'PHI access logged',
        pmsIntegrationId: entry.pmsIntegrationId,
        action: entry.action,
        phiAccessed: entry.phiAccessed,
      });
    } catch (error: any) {
      this.logger.error({
        msg: 'HIPAA audit logging failed',
        error: error.message,
      });
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
