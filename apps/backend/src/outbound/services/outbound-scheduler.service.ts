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
    this.logger.log({ accountCount: accounts.length, accountIds: accounts.map(a => a.id), msg: '[Scheduler] Recall: found enabled accounts' });

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

    this.logger.log({ msg: '[Scheduler] Daily recall scan complete' });
  }

  /**
   * Hourly scan for appointment reminders.
   * Checks for appointments within the configured reminder window.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scanReminderCandidates(): Promise<void> {
    this.logger.log({ msg: '[Scheduler] Starting hourly reminder scan' });

    const accounts = await this.getEnabledAccounts('PATIENT_CARE');
    this.logger.log({ accountCount: accounts.length, accountIds: accounts.map(a => a.id), msg: '[Scheduler] Reminder: found enabled accounts' });

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

    this.logger.log({ msg: '[Scheduler] Hourly reminder scan complete' });
  }

  /**
   * Daily scan for no-show re-engagement.
   * Runs at 10:00 AM to catch yesterday's no-shows.
   */
  @Cron('0 10 * * *')
  async scanNoShowCandidates(): Promise<void> {
    this.logger.log({ msg: '[Scheduler] Starting daily no-show scan' });

    const accounts = await this.getEnabledAccounts('PATIENT_CARE');
    this.logger.log({ accountCount: accounts.length, accountIds: accounts.map(a => a.id), msg: '[Scheduler] No-show: found enabled accounts' });

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

    this.logger.log({ msg: '[Scheduler] Daily no-show scan complete' });
  }

  /**
   * Monthly scan for reactivation candidates.
   * Runs on the 1st of each month at 7:00 AM.
   */
  @Cron('0 7 1 * *')
  async scanReactivationCandidates(): Promise<void> {
    this.logger.log({ msg: '[Scheduler] Starting monthly reactivation scan' });

    const accounts = await this.getEnabledAccounts('PATIENT_CARE');
    this.logger.log({ accountCount: accounts.length, accountIds: accounts.map(a => a.id), msg: '[Scheduler] Reactivation: found enabled accounts' });

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

    this.logger.log({ msg: '[Scheduler] Monthly reactivation scan complete' });
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

    if (!pmsIntegration) {
      this.logger.warn({ accountId, msg: '[Scheduler] No active PMS integration found — skipping account' });
      return null;
    }

    this.logger.log({ accountId, provider: pmsIntegration.provider, msg: '[Scheduler] Initializing PMS service' });

    try {
      const svc = await this.pmsService.getPmsService(
        accountId,
        pmsIntegration.provider,
        pmsIntegration.config,
      );
      this.logger.log({ accountId, msg: '[Scheduler] PMS service initialized successfully' });
      return svc;
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
   * Paginate through all patients from the PMS and build a lookup map.
   * Much more efficient than individual getPatient() calls when we need
   * phone/email for many patients (5-10 paginated calls vs N individual).
   */
  private async buildPatientMap(
    pmsService: any,
    accountId: string,
  ): Promise<Map<string, any>> {
    const map = new Map<string, any>();
    let offset = 0;
    const limit = 500;

    let pages = 0;
    try {
      while (true) {
        const result = await pmsService.listPatients({ limit, offset });
        pages++;
        const fetched = result.data?.length ?? 0;
        this.logger.log({ accountId, page: pages, offset, fetched, success: result.success, msg: '[Scheduler] Patient map page fetched' });
        if (!result.success || !fetched) break;
        for (const p of result.data) {
          map.set(p.id, p);
        }
        if (fetched < limit) break;
        offset += limit;
      }
    } catch (err) {
      this.logger.warn({
        accountId,
        page: pages + 1,
        offset,
        err: err instanceof Error ? err.message : err,
        msg: '[Scheduler] Patient map build interrupted — using partial map',
      });
    }

    this.logger.log({ accountId, totalPatients: map.size, pages, msg: '[Scheduler] Patient map built' });
    return map;
  }

  /** Load all DNC phone numbers for an account into a Set. */
  private async loadDncPhones(accountId: string): Promise<Set<string>> {
    const entries = await this.prisma.doNotCallEntry.findMany({
      where: { accountId },
      select: { phoneNumber: true },
    });
    const dncSet = new Set(entries.map((e) => e.phoneNumber));
    this.logger.log({ accountId, dncCount: dncSet.size, msg: '[Scheduler] DNC list loaded' });
    return dncSet;
  }

  /** Load patient IDs already queued/in-progress for a given call type. */
  private async loadAlreadyContactedPatients(
    accountId: string,
    callType: string,
  ): Promise<Set<string>> {
    const contacts = await this.prisma.campaignContact.findMany({
      where: {
        campaign: {
          accountId,
          callType: callType as any,
          status: { in: ['ACTIVE', 'SCHEDULED', 'DRAFT'] },
        },
        status: { in: ['QUEUED', 'IN_PROGRESS'] },
      },
      select: { patientId: true },
    });
    const contactedSet = new Set(contacts.map((c) => c.patientId));
    this.logger.log({ accountId, callType, alreadyContactedCount: contactedSet.size, msg: '[Scheduler] Already-contacted patients loaded' });
    return contactedSet;
  }

  /**
   * Check whether a patient passes channel-based contact filtering.
   * Returns the reachable contact value (phone or email) or null to skip.
   */
  private passesChannelFilter(
    patient: any,
    channel: string,
    dncPhones: Set<string>,
  ): { phone: string | null; email: string | null } | null {
    const phone = patient?.phone || null;
    const email = patient?.email || null;

    if (channel === 'phone' || channel === 'sms') {
      if (!phone) return null;
      if (dncPhones.has(phone)) return null;
      return { phone, email };
    }
    if (channel === 'email') {
      if (!email) return null;
      return { phone, email };
    }
    if (!phone && !email) return null;
    return { phone, email };
  }

  // ── Scan Processors ────────────────────────────────────────────────

  private async processRecallForAccount(
    accountId: string,
    settings: OutboundSettings,
  ): Promise<void> {
    this.logger.log({ accountId, msg: '[Scheduler] Recall: starting scan' });

    const pmsService = await this.getPmsServiceForAccount(accountId);
    if (!pmsService) return;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

    const channel = this.settingsService.getChannelForCallType(settings, 'recall');
    if (channel === 'none') {
      this.logger.log({ accountId, msg: '[Scheduler] Recall: channel is "none" — skipping' });
      return;
    }
    this.logger.log({ accountId, channel, msg: '[Scheduler] Recall: channel resolved' });

    const existingActive = await this.prisma.outboundCampaign.findFirst({
      where: {
        accountId,
        callType: 'RECALL',
        status: { in: ['ACTIVE', 'SCHEDULED', 'DRAFT'] },
        isAutoGenerated: true,
      },
    });
    if (existingActive) {
      this.logger.log({ accountId, existingCampaignId: existingActive.id, msg: '[Scheduler] Recall: active campaign already exists — skipping' });
      return;
    }

    try {
      this.logger.log({
        accountId,
        startDate: twoYearsAgo.toISOString().split('T')[0],
        endDate: sixMonthsAgo.toISOString().split('T')[0],
        msg: '[Scheduler] Recall: querying completed appointments',
      });

      const [result, patientMap, dncPhones, alreadyContacted] = await Promise.all([
        pmsService.getAppointments({ startDate: twoYearsAgo, endDate: sixMonthsAgo, status: 'completed', limit: 200 }),
        this.buildPatientMap(pmsService, accountId),
        this.loadDncPhones(accountId),
        this.loadAlreadyContactedPatients(accountId, 'RECALL'),
      ]);

      this.logger.log({
        accountId,
        appointmentsFound: result.data?.length ?? 0,
        appointmentsSuccess: result.success,
        patientMapSize: patientMap.size,
        dncCount: dncPhones.size,
        alreadyContactedCount: alreadyContacted.size,
        msg: '[Scheduler] Recall: parallel data loaded',
      });

      this.logger.log({ accountId, msg: '[Scheduler] Recall: querying upcoming scheduled appointments' });
      const upcoming = await pmsService.getAppointments({
        startDate: new Date(),
        endDate: sixMonthsFromNow,
        status: 'scheduled',
        limit: 500,
      });
      const scheduledPatients = new Set<string>(
        (upcoming.data || []).map((a: any) => a.patientId).filter(Boolean),
      );
      this.logger.log({ accountId, upcomingScheduledCount: scheduledPatients.size, msg: '[Scheduler] Recall: upcoming appointments loaded' });

      const seenPatients = new Set<string>();
      const contacts: CreateContactInput[] = [];
      const stats = { total: 0, dnc: 0, alreadyContacted: 0, scheduled: 0, noContact: 0, added: 0 };

      const hasAppointments = result.success && (result.data?.length ?? 0) > 0;

      if (hasAppointments) {
        for (const appt of result.data!) {
          const patientId = appt.patientId;
          if (!patientId || seenPatients.has(patientId)) continue;
          seenPatients.add(patientId);
          stats.total++;

          if (alreadyContacted.has(patientId)) { stats.alreadyContacted++; continue; }
          if (scheduledPatients.has(patientId)) { stats.scheduled++; continue; }

          const patient = patientMap.get(patientId);
          if (!patient) { stats.noContact++; continue; }

          const contactInfo = this.passesChannelFilter(patient, channel, dncPhones);
          if (!contactInfo) { if (dncPhones.has(patient?.phone)) stats.dnc++; else stats.noContact++; continue; }

          stats.added++;
          contacts.push({
            patientId,
            phoneNumber: contactInfo.phone || undefined,
            callContext: {
              patient_name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || appt.patientName || 'Patient',
              last_visit_date: appt.startTime?.toISOString() || '',
              email: contactInfo.email || undefined,
            },
          });
        }
      } else {
        this.logger.log({ accountId, msg: '[Scheduler] Recall: no appointments found — falling back to patient lastVisit data' });
        for (const [patientId, patient] of patientMap) {
          if (seenPatients.has(patientId)) continue;

          const lv = patient.lastVisit instanceof Date ? patient.lastVisit : null;
          const isOverdue = !lv || (lv.getTime() >= twoYearsAgo.getTime() && lv.getTime() <= sixMonthsAgo.getTime());
          if (!isOverdue) continue;

          seenPatients.add(patientId);
          stats.total++;

          if (alreadyContacted.has(patientId)) { stats.alreadyContacted++; continue; }
          if (scheduledPatients.has(patientId)) { stats.scheduled++; continue; }

          const contactInfo = this.passesChannelFilter(patient, channel, dncPhones);
          if (!contactInfo) { if (dncPhones.has(patient?.phone)) stats.dnc++; else stats.noContact++; continue; }

          stats.added++;
          contacts.push({
            patientId,
            phoneNumber: contactInfo.phone || undefined,
            callContext: {
              patient_name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient',
              last_visit_date: lv?.toISOString() || '',
              email: contactInfo.email || undefined,
            },
          });
        }
      }

      this.logger.log({ accountId, source: hasAppointments ? 'appointments' : 'patientMap', ...stats, msg: '[Scheduler] Recall: filtering complete' });

      if (contacts.length === 0) {
        this.logger.log({ accountId, msg: '[Scheduler] Recall: no eligible contacts after filtering' });
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
      if (autoApprove) await this.campaignService.updateCampaignStatus(campaign.id, 'ACTIVE');
      await this.createCampaignNotification(accountId, 'Recall/Recare', contacts.length, autoApprove);

      this.logger.log({
        accountId, campaignId: campaign.id, contactCount: contacts.length, autoApprove,
        msg: autoApprove ? '[Scheduler] Recall campaign created and activated' : '[Scheduler] Recall campaign created as DRAFT',
      });
    } catch (err) {
      this.logger.error({ accountId, err: err instanceof Error ? err.message : err, msg: '[Scheduler] Error building recall contacts from PMS' });
    }
  }

  private async processRemindersForAccount(
    accountId: string,
    settings: OutboundSettings,
  ): Promise<void> {
    this.logger.log({ accountId, msg: '[Scheduler] Reminder: starting scan' });

    const pmsService = await this.getPmsServiceForAccount(accountId);
    if (!pmsService) return;

    const reminderConfig = (settings.reminderConfig as any) || {};
    const hoursBeforeAppt = reminderConfig.hoursBeforeAppointment || 24;
    const channel = this.settingsService.getChannelForCallType(settings, 'reminder');
    if (channel === 'none') {
      this.logger.log({ accountId, msg: '[Scheduler] Reminder: channel is "none" — skipping' });
      return;
    }
    this.logger.log({ accountId, channel, hoursBeforeAppt, msg: '[Scheduler] Reminder: channel resolved' });

    const now = new Date();
    const windowStart = new Date(now.getTime() + hoursBeforeAppt * 60 * 60 * 1000);
    const windowEnd = new Date(windowStart.getTime() + hoursBeforeAppt * 60 * 60 * 1000);

    try {
      this.logger.log({ accountId, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(), msg: '[Scheduler] Reminder: querying scheduled appointments' });

      const [result, patientMap, dncPhones, alreadyContacted] = await Promise.all([
        pmsService.getAppointments({ startDate: windowStart, endDate: windowEnd, status: 'scheduled', limit: 100 }),
        this.buildPatientMap(pmsService, accountId),
        this.loadDncPhones(accountId),
        this.loadAlreadyContactedPatients(accountId, 'REMINDER'),
      ]);

      this.logger.log({
        accountId,
        appointmentsFound: result.data?.length ?? 0,
        appointmentsSuccess: result.success,
        patientMapSize: patientMap.size,
        dncCount: dncPhones.size,
        alreadyContactedCount: alreadyContacted.size,
        msg: '[Scheduler] Reminder: parallel data loaded',
      });

      if (!result.success || !result.data?.length) {
        this.logger.log({ accountId, count: result.data?.length ?? 0, success: result.success, msg: '[Scheduler] Reminder: no appointments in window' });
        return;
      }

      const contacts: CreateContactInput[] = [];
      const stats = { total: 0, alreadyContacted: 0, notInMap: 0, channelFiltered: 0, added: 0 };

      for (const appt of result.data) {
        const patientId = appt.patientId;
        if (!patientId) continue;
        stats.total++;
        if (alreadyContacted.has(patientId)) { stats.alreadyContacted++; continue; }

        const patient = patientMap.get(patientId);
        if (!patient) { stats.notInMap++; continue; }

        const contactInfo = this.passesChannelFilter(patient, channel, dncPhones);
        if (!contactInfo) { stats.channelFiltered++; continue; }

        stats.added++;

        contacts.push({
          patientId,
          phoneNumber: contactInfo.phone || undefined,
          callContext: {
            patient_name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || appt.patientName || 'Patient',
            appointment_date: (appt.startTime?.toISOString() || '').split('T')[0],
            appointment_time: appt.startTime?.toISOString() || '',
            appointment_type: appt.appointmentType || 'Dental Visit',
            provider_name: appt.providerName || '',
            email: contactInfo.email || undefined,
          },
        });
      }

      this.logger.log({ accountId, ...stats, msg: '[Scheduler] Reminder: filtering complete' });

      if (contacts.length === 0) {
        this.logger.log({ accountId, msg: '[Scheduler] Reminder: no eligible contacts after filtering' });
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
      if (autoApprove) await this.campaignService.updateCampaignStatus(campaign.id, 'ACTIVE');
      await this.createCampaignNotification(accountId, 'Reminder', contacts.length, autoApprove);

      this.logger.log({
        accountId, campaignId: campaign.id, contactCount: contacts.length, autoApprove,
        msg: autoApprove ? '[Scheduler] Reminder campaign created and activated' : '[Scheduler] Reminder campaign created as DRAFT',
      });
    } catch (err) {
      this.logger.error({ accountId, err: err instanceof Error ? err.message : err, msg: '[Scheduler] Error building reminder contacts' });
    }
  }

  private async processNoShowsForAccount(
    accountId: string,
    settings: OutboundSettings,
  ): Promise<void> {
    this.logger.log({ accountId, msg: '[Scheduler] No-show: starting scan' });

    const pmsService = await this.getPmsServiceForAccount(accountId);
    if (!pmsService) return;

    const channel = this.settingsService.getChannelForCallType(settings, 'noshow');
    if (channel === 'none') {
      this.logger.log({ accountId, msg: '[Scheduler] No-show: channel is "none" — skipping' });
      return;
    }
    this.logger.log({ accountId, channel, msg: '[Scheduler] No-show: channel resolved' });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    try {
      this.logger.log({ accountId, startDate: yesterday.toISOString().split('T')[0], endDate: endOfYesterday.toISOString().split('T')[0], msg: '[Scheduler] No-show: querying missed appointments' });

      const [result, patientMap, dncPhones, alreadyContacted] = await Promise.all([
        pmsService.getAppointments({ startDate: yesterday, endDate: endOfYesterday, status: 'no_show', limit: 50 }),
        this.buildPatientMap(pmsService, accountId),
        this.loadDncPhones(accountId),
        this.loadAlreadyContactedPatients(accountId, 'NOSHOW'),
      ]);

      this.logger.log({
        accountId,
        appointmentsFound: result.data?.length ?? 0,
        appointmentsSuccess: result.success,
        patientMapSize: patientMap.size,
        dncCount: dncPhones.size,
        alreadyContactedCount: alreadyContacted.size,
        msg: '[Scheduler] No-show: parallel data loaded',
      });

      if (!result.success || !result.data?.length) {
        this.logger.log({ accountId, count: result.data?.length ?? 0, success: result.success, msg: '[Scheduler] No-show: no appointments found' });
        return;
      }

      const contacts: CreateContactInput[] = [];
      const stats = { total: 0, alreadyContacted: 0, notInMap: 0, channelFiltered: 0, added: 0 };

      for (const appt of result.data) {
        const patientId = appt.patientId;
        if (!patientId) continue;
        stats.total++;
        if (alreadyContacted.has(patientId)) { stats.alreadyContacted++; continue; }

        const patient = patientMap.get(patientId);
        if (!patient) { stats.notInMap++; continue; }

        const contactInfo = this.passesChannelFilter(patient, channel, dncPhones);
        if (!contactInfo) { stats.channelFiltered++; continue; }

        stats.added++;

        contacts.push({
          patientId,
          phoneNumber: contactInfo.phone || undefined,
          callContext: {
            patient_name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || appt.patientName || 'Patient',
            appointment_date: (appt.startTime?.toISOString() || '').split('T')[0],
            appointment_time: appt.startTime?.toISOString() || '',
            appointment_type: appt.appointmentType || 'Dental Visit',
            email: contactInfo.email || undefined,
          },
        });
      }

      this.logger.log({ accountId, ...stats, msg: '[Scheduler] No-show: filtering complete' });

      if (contacts.length === 0) {
        this.logger.log({ accountId, msg: '[Scheduler] No-show: no eligible contacts after filtering' });
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
      if (autoApprove) await this.campaignService.updateCampaignStatus(campaign.id, 'ACTIVE');
      await this.createCampaignNotification(accountId, 'No-Show', contacts.length, autoApprove);

      this.logger.log({
        accountId, campaignId: campaign.id, contactCount: contacts.length, autoApprove,
        msg: autoApprove ? '[Scheduler] No-show campaign created and activated' : '[Scheduler] No-show campaign created as DRAFT',
      });
    } catch (err) {
      this.logger.error({ accountId, err: err instanceof Error ? err.message : err, msg: '[Scheduler] Error building no-show contacts' });
    }
  }

  private async processReactivationForAccount(
    accountId: string,
    settings: OutboundSettings,
  ): Promise<void> {
    this.logger.log({ accountId, msg: '[Scheduler] Reactivation: starting scan' });

    const pmsService = await this.getPmsServiceForAccount(accountId);
    if (!pmsService) return;

    const reactivationConfig = (settings.reactivationConfig as any) || {};
    const inactiveMonths = reactivationConfig.inactiveMonths || 12;
    const channel = this.settingsService.getChannelForCallType(settings, 'reactivation');
    if (channel === 'none') {
      this.logger.log({ accountId, msg: '[Scheduler] Reactivation: channel is "none" — skipping' });
      return;
    }
    this.logger.log({ accountId, channel, inactiveMonths, msg: '[Scheduler] Reactivation: channel resolved' });

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - inactiveMonths);
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

    const existingActive = await this.prisma.outboundCampaign.findFirst({
      where: {
        accountId,
        callType: 'REACTIVATION',
        status: { in: ['ACTIVE', 'SCHEDULED', 'DRAFT'] },
        isAutoGenerated: true,
      },
    });
    if (existingActive) {
      this.logger.log({ accountId, existingCampaignId: existingActive.id, msg: '[Scheduler] Reactivation: active campaign already exists — skipping' });
      return;
    }

    try {
      this.logger.log({
        accountId,
        startDate: threeYearsAgo.toISOString().split('T')[0],
        endDate: cutoffDate.toISOString().split('T')[0],
        inactiveMonths,
        msg: '[Scheduler] Reactivation: querying completed appointments',
      });

      const [result, patientMap, dncPhones, alreadyContacted] = await Promise.all([
        pmsService.getAppointments({ startDate: threeYearsAgo, endDate: cutoffDate, status: 'completed', limit: 200 }),
        this.buildPatientMap(pmsService, accountId),
        this.loadDncPhones(accountId),
        this.loadAlreadyContactedPatients(accountId, 'REACTIVATION'),
      ]);

      this.logger.log({
        accountId,
        appointmentsFound: result.data?.length ?? 0,
        appointmentsSuccess: result.success,
        patientMapSize: patientMap.size,
        dncCount: dncPhones.size,
        alreadyContactedCount: alreadyContacted.size,
        msg: '[Scheduler] Reactivation: parallel data loaded',
      });

      this.logger.log({ accountId, msg: '[Scheduler] Reactivation: querying upcoming scheduled appointments' });
      const upcoming = await pmsService.getAppointments({
        startDate: new Date(),
        endDate: sixMonthsFromNow,
        status: 'scheduled',
        limit: 500,
      });
      const scheduledPatients = new Set<string>(
        (upcoming.data || []).map((a: any) => a.patientId).filter(Boolean),
      );
      this.logger.log({ accountId, upcomingScheduledCount: scheduledPatients.size, msg: '[Scheduler] Reactivation: upcoming appointments loaded' });

      const seenPatients = new Set<string>();
      const contacts: CreateContactInput[] = [];
      const stats = { total: 0, dnc: 0, alreadyContacted: 0, scheduled: 0, noContact: 0, added: 0 };

      const hasAppointments = result.success && (result.data?.length ?? 0) > 0;

      if (hasAppointments) {
        for (const appt of result.data!) {
          const patientId = appt.patientId;
          if (!patientId || seenPatients.has(patientId)) continue;
          seenPatients.add(patientId);
          stats.total++;

          if (alreadyContacted.has(patientId)) { stats.alreadyContacted++; continue; }
          if (scheduledPatients.has(patientId)) { stats.scheduled++; continue; }

          const patient = patientMap.get(patientId);
          if (!patient) { stats.noContact++; continue; }

          const contactInfo = this.passesChannelFilter(patient, channel, dncPhones);
          if (!contactInfo) { if (dncPhones.has(patient?.phone)) stats.dnc++; else stats.noContact++; continue; }

          const visitDate = appt.startTime?.toISOString() || '';
          const monthsSince = visitDate
            ? Math.round((Date.now() - new Date(visitDate).getTime()) / (30.44 * 24 * 60 * 60 * 1000))
            : inactiveMonths;

          stats.added++;
          contacts.push({
            patientId,
            phoneNumber: contactInfo.phone || undefined,
            callContext: {
              patient_name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || appt.patientName || 'Patient',
              last_visit_date: visitDate,
              months_since_visit: String(monthsSince),
              email: contactInfo.email || undefined,
            },
          });
        }
      } else {
        this.logger.log({ accountId, msg: '[Scheduler] Reactivation: no appointments found — falling back to patient lastVisit data' });
        for (const [patientId, patient] of patientMap) {
          if (seenPatients.has(patientId)) continue;

          const lv = patient.lastVisit instanceof Date ? patient.lastVisit : null;
          const isInactive = !lv || lv.getTime() < cutoffDate.getTime();
          if (!isInactive) continue;

          seenPatients.add(patientId);
          stats.total++;

          if (alreadyContacted.has(patientId)) { stats.alreadyContacted++; continue; }
          if (scheduledPatients.has(patientId)) { stats.scheduled++; continue; }

          const contactInfo = this.passesChannelFilter(patient, channel, dncPhones);
          if (!contactInfo) { if (dncPhones.has(patient?.phone)) stats.dnc++; else stats.noContact++; continue; }

          const visitDate = lv?.toISOString() || '';
          const monthsSince = lv
            ? Math.round((Date.now() - lv.getTime()) / (30.44 * 24 * 60 * 60 * 1000))
            : inactiveMonths;

          stats.added++;
          contacts.push({
            patientId,
            phoneNumber: contactInfo.phone || undefined,
            callContext: {
              patient_name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient',
              last_visit_date: visitDate,
              months_since_visit: String(monthsSince),
              email: contactInfo.email || undefined,
            },
          });
        }
      }

      this.logger.log({ accountId, source: hasAppointments ? 'appointments' : 'patientMap', ...stats, msg: '[Scheduler] Reactivation: filtering complete' });

      if (contacts.length === 0) {
        this.logger.log({ accountId, msg: '[Scheduler] Reactivation: no eligible contacts after filtering' });
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
      if (autoApprove) await this.campaignService.updateCampaignStatus(campaign.id, 'ACTIVE');
      await this.createCampaignNotification(accountId, 'Reactivation', contacts.length, autoApprove);

      this.logger.log({
        accountId, campaignId: campaign.id, contactCount: contacts.length, autoApprove,
        msg: autoApprove ? '[Scheduler] Reactivation campaign created and activated' : '[Scheduler] Reactivation campaign created as DRAFT',
      });
    } catch (err) {
      this.logger.error({ accountId, err: err instanceof Error ? err.message : err, msg: '[Scheduler] Error building reactivation contacts' });
    }
  }
}
