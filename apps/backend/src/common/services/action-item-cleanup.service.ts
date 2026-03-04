import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ActionItemCleanupService {
  private readonly logger = new Logger(ActionItemCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Purge stale records daily at 4 AM UTC:
   *   - Action items older than 90 days
   *   - All notifications older than 30 days (regardless of dismissed status)
   */
  @Cron('0 4 * * *')
  async purgeOldRecords(): Promise<void> {
    await this.purgeActionItems();
    await this.purgeNotifications();
  }

  private async purgeActionItems(): Promise<void> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);

      const { count } = await this.prisma.actionItem.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });

      if (count > 0) {
        this.logger.log(`Purged ${count} action items older than 90 days`);
      }
    } catch (error) {
      this.logger.error('Failed to purge old action items', error);
    }
  }

  private async purgeNotifications(): Promise<void> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const { count } = await this.prisma.notification.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });

      if (count > 0) {
        this.logger.log(`Purged ${count} notifications older than 30 days`);
      }
    } catch (error) {
      this.logger.error('Failed to purge old notifications', error);
    }
  }
}
