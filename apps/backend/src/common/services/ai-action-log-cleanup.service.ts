import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AiActionLogCleanupService {
  private readonly logger = new Logger(AiActionLogCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Purge AiActionLog entries older than 3 months.
   * Runs daily at 3:00 AM UTC.
   *
   * HIPAA note: AiActionLog stores only non-PHI data (resource IDs, appointment
   * metadata, staff names). The separate PmsAuditLog table handles HIPAA-required
   * 6-year retention for PHI access auditing.
   */
  @Cron('0 3 * * *')
  async purgeOldActionLogs(): Promise<void> {
    try {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 3);

      const { count } = await this.prisma.aiActionLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });

      if (count > 0) {
        this.logger.log(`Purged ${count} AI action log entries older than 3 months`);
      }
    } catch (error) {
      this.logger.error('Failed to purge old AI action logs', error);
    }
  }
}
