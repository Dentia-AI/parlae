import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PmsService } from '../../pms/pms.service';
import { StructuredLogger } from '../../common/structured-logger';
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
    private readonly pmsService: PmsService,
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

  /**
   * Admin-triggered scan: run selected scan types for a specific account.
   * Returns the list of scan types that were executed.
   */
  async triggerScansForAccount(
    accountId: string,
    settings: OutboundSettings,
    scanTypes: string[],
  ): Promise<string[]> {
    const runAll = scanTypes.includes('all');
    const scansRun: string[] = [];

    if (runAll || scanTypes.includes('recall')) {
      await this.processRecallForAccount(accountId, settings);
      scansRun.push('recall');
    }
    if (runAll || scanTypes.includes('reminder')) {
      await this.processRemindersForAccount(accountId, settings);
      scansRun.push('reminder');
    }
    if (runAll || scanTypes.includes('noshow')) {
      await this.processNoShowsForAccount(accountId, settings);
      scansRun.push('noshow');
    }
    if (runAll || scanTypes.includes('reactivation')) {
      await this.processReactivationForAccount(accountId, settings);
      scansRun.push('reactivation');
    }

    this.logger.log({
      accountId,
      scansRun,
      msg: '[Scheduler] Admin-triggered scans completed',
    });

    return scansRun;
  }

  // ── Internal Helpers ─────────────────────────────────────────────────

  private async getEnabledAccounts(
    group: 'PATIENT_CARE' | 'FINANCIAL',
  ): Promise<Array<{ id: string; settings: OutboundSettings }>> {
    const field =
      group === 'PATIENT_CARE' ? 'patientCareEnabled' : 'financialEnabled';

    const settingsList = await this.prisma.outboundSettings.findMany({
      where: { [field]: true },
      include: { account: { select: { featureSettings: true } } },
    });

    return settingsList
      .filter((s) => {
        const fs = ((s as any).account?.featureSettings as Record<string, unknown>) ?? {};
        return fs['ai-receptionist'] !== false && fs['outbound-calls'] !== false;
      })
      .map((s) => ({ id: s.accountId, settings: s }));
  }

  private async createCampaignNotification(
    accountId: string,
    campaignType: string,
    contactCount: number,
    autoApproved: boolean,
  ): Promise<void> {
    try {
      const body = autoApproved
        ? `${campaignType} campaign started with ${contactCount} contact(s)`
        : `${campaignType} campaign ready for review — ${contactCount} contact(s) pending approval`;

      await this.prisma.notification.create({
        data: {
          accountId,
          body,
          type: autoApproved ? 'INFO' : 'WARNING',
          channel: 'IN_APP',
          link: '/home/outbound',
        },
      });
    } catch (err) {
      this.logger.error({
        accountId,
        err: err instanceof Error ? err.message : err,
        msg: '[Scheduler] Failed to create campaign notification',
      });
    }
  }

  private async getPmsServiceForAccount(accountId: string) {
    const pmsIntegration = await this.prisma.pmsIntegration.findFirst({
      where: { accountId, status: 'ACTIVE' },
    });

    if (!pmsIntegration) return null;

    try {
      return await this.pmsService.getPmsService(
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

  /**
   * Enrich appointments with patient phone numbers by looking up each
   * unique patient via the PMS patient endpoint. Sikka appointments
   * don't include patient phone — only patient_id and patient_name.
   */
  private async enrichWithPatientPhones(
    appointments: any[],
    pmsService: any,
    accountId: string,
  ): Promise<Array<{ patientId: string; patientName: string; patientPhone: string; date: string }>> {
    const enriched: Array<{ patientId: string; patientName: string; patientPhone: string; date: string }> = [];
    const phoneCache = new Map<string, string | null>();

    for (const appt of appointments) {
      const patientId = appt.patientId || appt.patient_id;
      if (!patientId) continue;

      if (!phoneCache.has(patientId)) {
        try {
          const patientResult = await pmsService.getPatient(patientId);
          const phone = patientResult?.data?.phone || patientResult?.data?.cell || null;
          phoneCache.set(patientId, phone);
        } catch {
          phoneCache.set(patientId, null);
        }
      }

      const phone = phoneCache.get(patientId);
      if (!phone) continue;

      enriched.push({
        patientId,
        patientName: appt.patientName || appt.patient_name || 'Patient',
        patientPhone: phone,
        date: appt.startTime?.toISOString?.() || appt.date || '',
      });
    }

    this.logger.log({
      accountId,
      totalAppts: appointments.length,
      uniquePatients: phoneCache.size,
      withPhone: enriched.length,
      withoutPhone: phoneCache.size - enriched.length,
      msg: '[Scheduler] Patient phone enrichment completed',
    });

    return enriched;
  }

  private async processRecallForAccount(
    accountId: string,
    settings: OutboundSettings,
  ): Promise<void> {
    const pmsService = await this.getPmsServiceForAccount(accountId);
    if (!pmsService) return;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const channel = this.settingsService.getChannelForCallType(settings, 'recall');
    if (channel === 'none') return;

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
      this.logger.log({
        accountId,
        startDate: twoYearsAgo.toISOString().split('T')[0],
        endDate: sixMonthsAgo.toISOString().split('T')[0],
        msg: '[Scheduler] Recall: querying completed appointments',
      });

      const result = await pmsService.getAppointments({
        startDate: twoYearsAgo,
        endDate: sixMonthsAgo,
        status: 'completed',
        limit: 200,
      });

      if (!result.success || !result.data?.length) {
        this.logger.log({ accountId, count: result.data?.length ?? 0, msg: '[Scheduler] Recall: no appointments found in range' });
        return;
      }

      const enriched = await this.enrichWithPatientPhones(result.data, pmsService, accountId);
      const seenPatients = new Set<string>();
      const contacts: CreateContactInput[] = [];

      for (const entry of enriched) {
        if (seenPatients.has(entry.patientId)) continue;
        seenPatients.add(entry.patientId);

        contacts.push({
          patientId: entry.patientId,
          phoneNumber: entry.patientPhone,
          callContext: {
            patient_name: entry.patientName,
            last_visit_date: entry.date,
          },
        });
      }

      if (contacts.length === 0) {
        this.logger.log({ accountId, msg: '[Scheduler] Recall: no contacts with phone numbers' });
        return;
      }

      const autoApprove = (settings as any).autoApproveCampaigns === true;

      const campaign = await this.campaignService.createCampaign({
        accountId,
        name: `Auto: Recall/Recare - ${new Date().toISOString().slice(0, 10)}`,
        callType: 'RECALL',
        channel: channel.toUpperCase() as any,
        isAutoGenerated: true,
        scheduledStartAt: autoApprove ? new Date() : undefined,
        timezone: settings.timezone,
        callingWindowStart: settings.callingWindowStart,
        callingWindowEnd: settings.callingWindowEnd,
        maxConcurrent: settings.maxConcurrentCalls,
      });

      await this.campaignService.addContacts(campaign.id, contacts);

      if (autoApprove) {
        await this.campaignService.updateCampaignStatus(campaign.id, 'ACTIVE');
      }

      await this.createCampaignNotification(accountId, 'Recall/Recare', contacts.length, autoApprove);

      this.logger.log({
        accountId,
        campaignId: campaign.id,
        contactCount: contacts.length,
        autoApprove,
        msg: autoApprove
          ? '[Scheduler] Recall campaign created and activated'
          : '[Scheduler] Recall campaign created as DRAFT (pending approval)',
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
    if (channel === 'none') return;

    const now = new Date();
    const windowStart = new Date(now.getTime() + hoursBeforeAppt * 60 * 60 * 1000);
    const windowEnd = new Date(windowStart.getTime() + hoursBeforeAppt * 60 * 60 * 1000);

    try {
      this.logger.log({
        accountId,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        msg: '[Scheduler] Reminder: querying scheduled appointments',
      });

      const result = await pmsService.getAppointments({
        startDate: windowStart,
        endDate: windowEnd,
        status: 'scheduled',
        limit: 100,
      });

      if (!result.success || !result.data?.length) {
        this.logger.log({ accountId, count: result.data?.length ?? 0, msg: '[Scheduler] Reminder: no appointments in window' });
        return;
      }

      const enriched = await this.enrichWithPatientPhones(result.data, pmsService, accountId);
      const contacts: CreateContactInput[] = [];

      for (const entry of enriched) {
        const appt = result.data.find((a: any) => (a.patientId || a.patient_id) === entry.patientId);
        contacts.push({
          patientId: entry.patientId,
          phoneNumber: entry.patientPhone,
          callContext: {
            patient_name: entry.patientName,
            appointment_date: entry.date?.split('T')[0] || '',
            appointment_time: entry.date,
            appointment_type: (appt as any)?.appointmentType || 'Dental Visit',
            provider_name: (appt as any)?.providerName || '',
          },
        });
      }

      if (contacts.length === 0) {
        this.logger.log({ accountId, msg: '[Scheduler] Reminder: no contacts with phone numbers' });
        return;
      }

      const autoApprove = (settings as any).autoApproveCampaigns === true;

      const campaign = await this.campaignService.createCampaign({
        accountId,
        name: `Auto: Reminder - ${new Date().toISOString().slice(0, 10)}`,
        callType: 'REMINDER',
        channel: channel.toUpperCase() as any,
        isAutoGenerated: true,
        scheduledStartAt: autoApprove ? new Date() : undefined,
        timezone: settings.timezone,
        callingWindowStart: settings.callingWindowStart,
        callingWindowEnd: settings.callingWindowEnd,
      });

      await this.campaignService.addContacts(campaign.id, contacts);

      if (autoApprove) {
        await this.campaignService.updateCampaignStatus(campaign.id, 'ACTIVE');
      }

      await this.createCampaignNotification(accountId, 'Reminder', contacts.length, autoApprove);

      this.logger.log({
        accountId,
        campaignId: campaign.id,
        contactCount: contacts.length,
        autoApprove,
        msg: autoApprove
          ? '[Scheduler] Reminder campaign created and activated'
          : '[Scheduler] Reminder campaign created as DRAFT (pending approval)',
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
    if (channel === 'none') return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    try {
      this.logger.log({
        accountId,
        startDate: yesterday.toISOString().split('T')[0],
        endDate: endOfYesterday.toISOString().split('T')[0],
        msg: '[Scheduler] No-show: querying missed appointments',
      });

      const result = await pmsService.getAppointments({
        startDate: yesterday,
        endDate: endOfYesterday,
        status: 'no_show',
        limit: 50,
      });

      if (!result.success || !result.data?.length) {
        this.logger.log({ accountId, count: result.data?.length ?? 0, msg: '[Scheduler] No-show: no appointments found' });
        return;
      }

      const enriched = await this.enrichWithPatientPhones(result.data, pmsService, accountId);
      const contacts: CreateContactInput[] = [];

      for (const entry of enriched) {
        const appt = result.data.find((a: any) => (a.patientId || a.patient_id) === entry.patientId);
        contacts.push({
          patientId: entry.patientId,
          phoneNumber: entry.patientPhone,
          callContext: {
            patient_name: entry.patientName,
            appointment_date: entry.date?.split('T')[0] || '',
            appointment_time: entry.date,
            appointment_type: (appt as any)?.appointmentType || 'Dental Visit',
          },
        });
      }

      if (contacts.length === 0) {
        this.logger.log({ accountId, msg: '[Scheduler] No-show: no contacts with phone numbers' });
        return;
      }

      const autoApprove = (settings as any).autoApproveCampaigns === true;

      const campaign = await this.campaignService.createCampaign({
        accountId,
        name: `Auto: No-Show Re-engagement - ${new Date().toISOString().slice(0, 10)}`,
        callType: 'NOSHOW',
        channel: channel.toUpperCase() as any,
        isAutoGenerated: true,
        scheduledStartAt: autoApprove ? new Date() : undefined,
        timezone: settings.timezone,
        callingWindowStart: settings.callingWindowStart,
        callingWindowEnd: settings.callingWindowEnd,
      });

      await this.campaignService.addContacts(campaign.id, contacts);

      if (autoApprove) {
        await this.campaignService.updateCampaignStatus(campaign.id, 'ACTIVE');
      }

      await this.createCampaignNotification(accountId, 'No-Show', contacts.length, autoApprove);

      this.logger.log({
        accountId,
        campaignId: campaign.id,
        contactCount: contacts.length,
        autoApprove,
        msg: autoApprove
          ? '[Scheduler] No-show campaign created and activated'
          : '[Scheduler] No-show campaign created as DRAFT (pending approval)',
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
    if (channel === 'none') return;

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - inactiveMonths);
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

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
      this.logger.log({
        accountId,
        startDate: threeYearsAgo.toISOString().split('T')[0],
        endDate: cutoffDate.toISOString().split('T')[0],
        inactiveMonths,
        msg: '[Scheduler] Reactivation: querying completed appointments',
      });

      const result = await pmsService.getAppointments({
        startDate: threeYearsAgo,
        endDate: cutoffDate,
        status: 'completed',
        limit: 200,
      });

      if (!result.success || !result.data?.length) {
        this.logger.log({ accountId, count: result.data?.length ?? 0, msg: '[Scheduler] Reactivation: no appointments found in range' });
        return;
      }

      const enriched = await this.enrichWithPatientPhones(result.data, pmsService, accountId);
      const seenPatients = new Set<string>();
      const contacts: CreateContactInput[] = [];

      for (const entry of enriched) {
        if (seenPatients.has(entry.patientId)) continue;
        seenPatients.add(entry.patientId);

        const monthsSince = entry.date
          ? Math.round((Date.now() - new Date(entry.date).getTime()) / (30.44 * 24 * 60 * 60 * 1000))
          : inactiveMonths;

        contacts.push({
          patientId: entry.patientId,
          phoneNumber: entry.patientPhone,
          callContext: {
            patient_name: entry.patientName,
            last_visit_date: entry.date,
            months_since_visit: String(monthsSince),
          },
        });
      }

      if (contacts.length === 0) {
        this.logger.log({ accountId, msg: '[Scheduler] Reactivation: no contacts with phone numbers' });
        return;
      }

      const autoApprove = (settings as any).autoApproveCampaigns === true;

      const campaign = await this.campaignService.createCampaign({
        accountId,
        name: `Auto: Reactivation - ${new Date().toISOString().slice(0, 10)}`,
        callType: 'REACTIVATION',
        channel: channel.toUpperCase() as any,
        isAutoGenerated: true,
        scheduledStartAt: autoApprove ? new Date() : undefined,
        timezone: settings.timezone,
        callingWindowStart: settings.callingWindowStart,
        callingWindowEnd: settings.callingWindowEnd,
      });

      await this.campaignService.addContacts(campaign.id, contacts);

      if (autoApprove) {
        await this.campaignService.updateCampaignStatus(campaign.id, 'ACTIVE');
      }

      await this.createCampaignNotification(accountId, 'Reactivation', contacts.length, autoApprove);

      this.logger.log({
        accountId,
        campaignId: campaign.id,
        contactCount: contacts.length,
        autoApprove,
        msg: autoApprove
          ? '[Scheduler] Reactivation campaign created and activated'
          : '[Scheduler] Reactivation campaign created as DRAFT (pending approval)',
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
