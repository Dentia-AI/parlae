import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { StructuredLogger } from '../../common/structured-logger';
import { SecretsService } from '../../common/services/secrets.service';
import { OutboundCampaignService, type CreateContactInput } from './outbound-campaign.service';
import { OutboundSettingsService } from './outbound-settings.service';
import type { OutboundSettings } from '@kit/prisma';

/**
 * Outbound Scheduler Service
 *
 * Runs periodic scans on PMS/GCal data to auto-generate and populate
 * outbound campaigns based on account settings:
 *
 * - Recall/Recare: patients overdue for routine cleaning (every 6 months)
 * - Reminder: upcoming appointments within configured hours
 * - No-Show: missed appointments from yesterday
 * - Follow-Up: recent procedures matching configured types
 * - Reactivation: patients inactive beyond configured threshold
 *
 * These scans only run for accounts where the corresponding agent group is enabled.
 */
@Injectable()
export class OutboundSchedulerService {
  private readonly logger = new StructuredLogger(OutboundSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly campaignService: OutboundCampaignService,
    private readonly settingsService: OutboundSettingsService,
  ) {}

  /**
   * Daily scan for recall/recare candidates.
   * Runs at 6:00 AM daily to populate recall campaigns.
   */
  @Cron('0 6 * * *')
  async scanRecallCandidates(): Promise<void> {
    this.logger.log({ msg: '[Scheduler] Starting daily recall scan' });

    const accounts = await this.getEnabledAccounts('PATIENT_CARE');
    for (const acct of accounts) {
      try {
        await this.processRecallForAccount(acct.id, acct.settings);
      } catch (err) {
        this.logger.error({
          accountId: acct.id,
          err: err instanceof Error ? err.message : err,
          msg: '[Scheduler] Recall scan failed for account',
        });
      }
    }
  }

  /**
   * Hourly scan for appointment reminders.
   * Checks for appointments within the configured reminder window.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scanReminderCandidates(): Promise<void> {
    this.logger.log({ msg: '[Scheduler] Starting hourly reminder scan' });

    const accounts = await this.getEnabledAccounts('PATIENT_CARE');
    for (const acct of accounts) {
      try {
        await this.processRemindersForAccount(acct.id, acct.settings);
      } catch (err) {
        this.logger.error({
          accountId: acct.id,
          err: err instanceof Error ? err.message : err,
          msg: '[Scheduler] Reminder scan failed for account',
        });
      }
    }
  }

  /**
   * Daily scan for no-show re-engagement.
   * Runs at 10:00 AM to catch yesterday's no-shows.
   */
  @Cron('0 10 * * *')
  async scanNoShowCandidates(): Promise<void> {
    this.logger.log({ msg: '[Scheduler] Starting daily no-show scan' });

    const accounts = await this.getEnabledAccounts('PATIENT_CARE');
    for (const acct of accounts) {
      try {
        await this.processNoShowsForAccount(acct.id, acct.settings);
      } catch (err) {
        this.logger.error({
          accountId: acct.id,
          err: err instanceof Error ? err.message : err,
          msg: '[Scheduler] No-show scan failed for account',
        });
      }
    }
  }

  /**
   * Monthly scan for reactivation candidates.
   * Runs on the 1st of each month at 7:00 AM.
   */
  @Cron('0 7 1 * *')
  async scanReactivationCandidates(): Promise<void> {
    this.logger.log({ msg: '[Scheduler] Starting monthly reactivation scan' });

    const accounts = await this.getEnabledAccounts('PATIENT_CARE');
    for (const acct of accounts) {
      try {
        await this.processReactivationForAccount(acct.id, acct.settings);
      } catch (err) {
        this.logger.error({
          accountId: acct.id,
          err: err instanceof Error ? err.message : err,
          msg: '[Scheduler] Reactivation scan failed for account',
        });
      }
    }
  }

  /**
   * Auto-bootstrap: when a group is enabled, generate initial campaigns.
   * Called from OutboundSettingsService.enableAgentGroup().
   */
  async bootstrapCampaignsForAccount(
    accountId: string,
    group: 'PATIENT_CARE' | 'FINANCIAL',
  ): Promise<void> {
    this.logger.log({ accountId, group, msg: '[Scheduler] Bootstrap initial campaigns' });

    const settings = await this.settingsService.getSettings(accountId);
    if (!settings) return;

    if (group === 'PATIENT_CARE') {
      await this.processRecallForAccount(accountId, settings);
      await this.processRemindersForAccount(accountId, settings);
      await this.processNoShowsForAccount(accountId, settings);
    }
  }

  // ── Internal Helpers ─────────────────────────────────────────────────

  private async getEnabledAccounts(
    group: 'PATIENT_CARE' | 'FINANCIAL',
  ): Promise<Array<{ id: string; settings: OutboundSettings }>> {
    const field =
      group === 'PATIENT_CARE' ? 'patientCareEnabled' : 'financialEnabled';

    const settingsList = await this.prisma.outboundSettings.findMany({
      where: { [field]: true },
    });

    return settingsList.map((s) => ({ id: s.accountId, settings: s }));
  }

  private async getPmsServiceForAccount(accountId: string) {
    const pmsIntegration = await this.prisma.pmsIntegration.findFirst({
      where: { accountId, status: 'ACTIVE' },
    });

    if (!pmsIntegration) return null;

    try {
      const { PmsService } = await import('../../pms/pms.service');
      const pmsService = new PmsService(this.prisma, this.secretsService);
      return pmsService.getPmsService(
        accountId,
        pmsIntegration.provider,
        pmsIntegration.config,
      );
    } catch (err) {
      this.logger.error({
        accountId,
        err: err instanceof Error ? err.message : err,
        msg: '[Scheduler] Failed to initialize PMS service',
      });
      return null;
    }
  }

  private async processRecallForAccount(
    accountId: string,
    settings: OutboundSettings,
  ): Promise<void> {
    const pmsService = await this.getPmsServiceForAccount(accountId);
    if (!pmsService) return;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const channel = this.settingsService.getChannelForCallType(settings, 'recall');

    const existingActive = await this.prisma.outboundCampaign.findFirst({
      where: {
        accountId,
        callType: 'RECALL',
        status: { in: ['ACTIVE', 'SCHEDULED', 'DRAFT'] },
        isAutoGenerated: true,
      },
    });
    if (existingActive) return;

    try {
      const result = await pmsService.getAppointments({
        endDate: sixMonthsAgo,
        status: 'completed',
        limit: 200,
      });

      if (!result.success || !result.data?.length) return;

      const contacts: CreateContactInput[] = [];
      const seenPatients = new Set<string>();

      for (const appt of result.data) {
        const patientId = (appt as any).patientId || (appt as any).patient_id;
        if (!patientId || seenPatients.has(patientId)) continue;
        seenPatients.add(patientId);

        const phone = (appt as any).patientPhone || (appt as any).patient_phone;
        const name = (appt as any).patientName || (appt as any).patient_name || 'Patient';
        if (!phone) continue;

        contacts.push({
          patientId,
          phoneNumber: phone,
          callContext: {
            patient_name: name,
            last_visit_date: (appt as any).date || (appt as any).start_time,
          },
        });
      }

      if (contacts.length === 0) return;

      const campaign = await this.campaignService.createCampaign({
        accountId,
        name: `Auto: Recall/Recare - ${new Date().toISOString().slice(0, 10)}`,
        callType: 'RECALL',
        channel: channel.toUpperCase() as any,
        isAutoGenerated: true,
        timezone: settings.timezone,
        callingWindowStart: settings.callingWindowStart,
        callingWindowEnd: settings.callingWindowEnd,
        maxConcurrent: settings.maxConcurrentCalls,
      });

      await this.campaignService.addContacts(campaign.id, contacts);

      this.logger.log({
        accountId,
        campaignId: campaign.id,
        contactCount: contacts.length,
        msg: '[Scheduler] Recall campaign created',
      });
    } catch (err) {
      this.logger.error({
        accountId,
        err: err instanceof Error ? err.message : err,
        msg: '[Scheduler] Error building recall contacts from PMS',
      });
    }
  }

  private async processRemindersForAccount(
    accountId: string,
    settings: OutboundSettings,
  ): Promise<void> {
    const pmsService = await this.getPmsServiceForAccount(accountId);
    if (!pmsService) return;

    const reminderConfig = (settings.reminderConfig as any) || {};
    const hoursBeforeAppt = reminderConfig.hoursBeforeAppointment || 24;
    const channel = this.settingsService.getChannelForCallType(settings, 'reminder');

    const now = new Date();
    const windowStart = new Date(now.getTime() + hoursBeforeAppt * 60 * 60 * 1000);
    const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);

    try {
      const result = await pmsService.getAppointments({
        startDate: windowStart,
        endDate: windowEnd,
        status: 'scheduled',
        limit: 100,
      });

      if (!result.success || !result.data?.length) return;

      const contacts: CreateContactInput[] = [];

      for (const appt of result.data) {
        const phone = (appt as any).patientPhone || (appt as any).patient_phone;
        const name = (appt as any).patientName || (appt as any).patient_name || 'Patient';
        if (!phone) continue;

        contacts.push({
          patientId: (appt as any).patientId || (appt as any).patient_id,
          phoneNumber: phone,
          callContext: {
            patient_name: name,
            appointment_date: (appt as any).date,
            appointment_time: (appt as any).startTime || (appt as any).start_time,
            appointment_type: (appt as any).type || (appt as any).appointment_type || 'Dental Visit',
            provider_name: (appt as any).providerName || (appt as any).provider_name || '',
          },
        });
      }

      if (contacts.length === 0) return;

      const campaign = await this.campaignService.createCampaign({
        accountId,
        name: `Auto: Reminder - ${new Date().toISOString().slice(0, 10)}`,
        callType: 'REMINDER',
        channel: channel.toUpperCase() as any,
        isAutoGenerated: true,
        scheduledStartAt: new Date(),
        timezone: settings.timezone,
        callingWindowStart: settings.callingWindowStart,
        callingWindowEnd: settings.callingWindowEnd,
      });

      await this.campaignService.addContacts(campaign.id, contacts);
      await this.campaignService.updateCampaignStatus(campaign.id, 'ACTIVE');

      this.logger.log({
        accountId,
        campaignId: campaign.id,
        contactCount: contacts.length,
        msg: '[Scheduler] Reminder campaign created and activated',
      });
    } catch (err) {
      this.logger.error({
        accountId,
        err: err instanceof Error ? err.message : err,
        msg: '[Scheduler] Error building reminder contacts',
      });
    }
  }

  private async processNoShowsForAccount(
    accountId: string,
    settings: OutboundSettings,
  ): Promise<void> {
    const pmsService = await this.getPmsServiceForAccount(accountId);
    if (!pmsService) return;

    const channel = this.settingsService.getChannelForCallType(settings, 'noshow');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    try {
      const result = await pmsService.getAppointments({
        startDate: yesterday,
        endDate: endOfYesterday,
        status: 'no_show',
        limit: 50,
      });

      if (!result.success || !result.data?.length) return;

      const contacts: CreateContactInput[] = [];

      for (const appt of result.data) {
        const phone = (appt as any).patientPhone || (appt as any).patient_phone;
        const name = (appt as any).patientName || (appt as any).patient_name || 'Patient';
        if (!phone) continue;

        contacts.push({
          patientId: (appt as any).patientId || (appt as any).patient_id,
          phoneNumber: phone,
          callContext: {
            patient_name: name,
            appointment_date: (appt as any).date,
            appointment_time: (appt as any).startTime || (appt as any).start_time,
            appointment_type: (appt as any).type || (appt as any).appointment_type || 'Dental Visit',
          },
        });
      }

      if (contacts.length === 0) return;

      const campaign = await this.campaignService.createCampaign({
        accountId,
        name: `Auto: No-Show Re-engagement - ${new Date().toISOString().slice(0, 10)}`,
        callType: 'NOSHOW',
        channel: channel.toUpperCase() as any,
        isAutoGenerated: true,
        timezone: settings.timezone,
        callingWindowStart: settings.callingWindowStart,
        callingWindowEnd: settings.callingWindowEnd,
      });

      await this.campaignService.addContacts(campaign.id, contacts);

      this.logger.log({
        accountId,
        campaignId: campaign.id,
        contactCount: contacts.length,
        msg: '[Scheduler] No-show campaign created',
      });
    } catch (err) {
      this.logger.error({
        accountId,
        err: err instanceof Error ? err.message : err,
        msg: '[Scheduler] Error building no-show contacts',
      });
    }
  }

  private async processReactivationForAccount(
    accountId: string,
    settings: OutboundSettings,
  ): Promise<void> {
    const pmsService = await this.getPmsServiceForAccount(accountId);
    if (!pmsService) return;

    const reactivationConfig = (settings.reactivationConfig as any) || {};
    const inactiveMonths = reactivationConfig.inactiveMonths || 12;
    const channel = this.settingsService.getChannelForCallType(settings, 'reactivation');

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - inactiveMonths);

    const existingActive = await this.prisma.outboundCampaign.findFirst({
      where: {
        accountId,
        callType: 'REACTIVATION',
        status: { in: ['ACTIVE', 'SCHEDULED', 'DRAFT'] },
        isAutoGenerated: true,
      },
    });
    if (existingActive) return;

    try {
      const result = await pmsService.getAppointments({
        endDate: cutoffDate,
        status: 'completed',
        limit: 200,
      });

      if (!result.success || !result.data?.length) return;

      const contacts: CreateContactInput[] = [];
      const seenPatients = new Set<string>();

      for (const appt of result.data) {
        const patientId = (appt as any).patientId || (appt as any).patient_id;
        if (!patientId || seenPatients.has(patientId)) continue;
        seenPatients.add(patientId);

        const phone = (appt as any).patientPhone || (appt as any).patient_phone;
        const name = (appt as any).patientName || (appt as any).patient_name || 'Patient';
        if (!phone) continue;

        const lastDate = (appt as any).date || (appt as any).start_time || '';
        const monthsSince = lastDate
          ? Math.round((Date.now() - new Date(lastDate).getTime()) / (30.44 * 24 * 60 * 60 * 1000))
          : inactiveMonths;

        contacts.push({
          patientId,
          phoneNumber: phone,
          callContext: {
            patient_name: name,
            last_visit_date: lastDate,
            months_since_visit: String(monthsSince),
          },
        });
      }

      if (contacts.length === 0) return;

      const campaign = await this.campaignService.createCampaign({
        accountId,
        name: `Auto: Reactivation - ${new Date().toISOString().slice(0, 10)}`,
        callType: 'REACTIVATION',
        channel: channel.toUpperCase() as any,
        isAutoGenerated: true,
        timezone: settings.timezone,
        callingWindowStart: settings.callingWindowStart,
        callingWindowEnd: settings.callingWindowEnd,
      });

      await this.campaignService.addContacts(campaign.id, contacts);

      this.logger.log({
        accountId,
        campaignId: campaign.id,
        contactCount: contacts.length,
        msg: '[Scheduler] Reactivation campaign created',
      });
    } catch (err) {
      this.logger.error({
        accountId,
        err: err instanceof Error ? err.message : err,
        msg: '[Scheduler] Error building reactivation contacts',
      });
    }
  }
}
