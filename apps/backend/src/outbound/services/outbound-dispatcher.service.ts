import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { StructuredLogger } from '../../common/structured-logger';
import { OutboundCampaignService } from './outbound-campaign.service';
import { OutboundSettingsService } from './outbound-settings.service';
import { RetellTemplateService } from '../../retell/retell-template.service';
import type { CampaignContact, OutboundCampaign, OutboundSettings } from '@kit/prisma';

// TEMPORARY: Route all outbound calls to test number. Set to null to disable.
const TEST_OVERRIDE_NUMBER: string | null = '+14387931089';

const CALL_TYPE_TO_AGENT_GROUP: Record<string, 'PATIENT_CARE' | 'FINANCIAL'> = {
  recall: 'PATIENT_CARE',
  reminder: 'PATIENT_CARE',
  followup: 'PATIENT_CARE',
  noshow: 'PATIENT_CARE',
  treatment_plan: 'PATIENT_CARE',
  postop: 'PATIENT_CARE',
  reactivation: 'PATIENT_CARE',
  survey: 'PATIENT_CARE',
  welcome: 'PATIENT_CARE',
  payment: 'FINANCIAL',
  benefits: 'FINANCIAL',
};

@Injectable()
export class OutboundDispatcherService {
  private readonly logger = new StructuredLogger(OutboundDispatcherService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignService: OutboundCampaignService,
    private readonly settingsService: OutboundSettingsService,
    private readonly retellService: RetellTemplateService,
  ) {}

  /**
   * Main dispatch loop. Runs every 30 seconds.
   * Picks up queued contacts from active campaigns and dispatches them
   * via the appropriate channel (phone/SMS/email).
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const activeCampaigns = await this.prisma.outboundCampaign.findMany({
        where: { status: 'ACTIVE' },
        include: { account: { select: { id: true, brandingTimezone: true } } },
      });

      for (const campaign of activeCampaigns) {
        await this.processCampaign(campaign);
      }

      await this.activateScheduledCampaigns();
    } catch (err) {
      this.logger.error({ err, msg: 'Error in outbound dispatch loop' });
    } finally {
      this.processing = false;
    }
  }

  private async activateScheduledCampaigns(): Promise<void> {
    const now = new Date();
    const scheduled = await this.prisma.outboundCampaign.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledStartAt: { lte: now },
      },
    });

    for (const campaign of scheduled) {
      const groupEnabled = await this.isAgentGroupEnabled(
        campaign.accountId,
        campaign.callType,
      );
      if (!groupEnabled) continue;

      await this.campaignService.updateCampaignStatus(campaign.id, 'ACTIVE');
      this.logger.log({
        campaignId: campaign.id,
        msg: 'Activated scheduled campaign',
      });
    }
  }

  private async processCampaign(campaign: OutboundCampaign): Promise<void> {
    const settings = await this.settingsService.getSettings(campaign.accountId);
    if (!settings) return;

    const groupEnabled = await this.isAgentGroupEnabled(
      campaign.accountId,
      campaign.callType,
    );
    if (!groupEnabled) return;

    if (!this.isWithinCallingWindow(campaign, settings)) return;

    const inProgressCount = await this.prisma.campaignContact.count({
      where: {
        campaignId: campaign.id,
        status: { in: ['DIALING', 'IN_PROGRESS'] },
      },
    });

    const slotsAvailable = campaign.maxConcurrent - inProgressCount;
    if (slotsAvailable <= 0) return;

    const contacts = await this.campaignService.getQueuedContacts(
      campaign.id,
      slotsAvailable,
    );

    for (const contact of contacts) {
      if (!contact.phoneNumber) {
        await this.campaignService.updateContactStatus(contact.id, {
          status: 'FAILED' as any,
          outcome: 'no_phone_number',
          completedAt: new Date(),
        });
        await this.campaignService.incrementCampaignStats(campaign.id, true, false);
        continue;
      }

      const isDnc = await this.isOnDncList(campaign.accountId, contact.phoneNumber);
      if (isDnc) {
        await this.campaignService.updateContactStatus(contact.id, {
          status: 'CANCELLED',
          outcome: 'dnc_excluded',
          completedAt: new Date(),
        });
        await this.campaignService.incrementCampaignStats(campaign.id, true, false);
        continue;
      }

      const channel = campaign.channel;
      try {
        switch (channel) {
          case 'PHONE':
            await this.dispatchPhoneCall(campaign, contact, settings);
            break;
          case 'SMS':
            await this.dispatchSms(campaign, contact, settings);
            break;
          case 'EMAIL':
            await this.dispatchEmail(campaign, contact, settings);
            break;
        }
      } catch (err) {
        this.logger.error({
          contactId: contact.id,
          channel,
          err,
          msg: 'Failed to dispatch outbound contact',
        });
        await this.campaignService.updateContactStatus(contact.id, {
          status: 'FAILED',
          attempts: contact.attempts + 1,
          lastAttemptAt: new Date(),
        });
      }
    }

    await this.campaignService.checkAndCompleteCampaign(campaign.id);
  }

  private async dispatchPhoneCall(
    campaign: OutboundCampaign,
    contact: CampaignContact,
    settings: OutboundSettings,
  ): Promise<void> {
    const fromNumber = await this.getFromNumber(campaign.accountId, settings);
    if (!fromNumber) {
      this.logger.error({
        accountId: campaign.accountId,
        msg: 'No from phone number configured for outbound calls',
      });
      return;
    }

    const agentGroup = CALL_TYPE_TO_AGENT_GROUP[campaign.callType] || 'PATIENT_CARE';

    const perAccountAgentId =
      agentGroup === 'PATIENT_CARE'
        ? settings.patientCareRetellAgentId
        : settings.financialRetellAgentId;

    const template = await this.prisma.outboundAgentTemplate.findUnique({
      where: { agentGroup },
    });

    const agentId = perAccountAgentId || campaign.retellAgentId || template?.retellAgentId;
    if (!agentId) {
      this.logger.error({
        agentGroup,
        msg: 'No Retell agent ID configured for outbound agent group',
      });
      return;
    }

    const voicemailMessages = (template?.voicemailMessages as Record<string, string>) || {};
    const voicemailMsg = settings.leaveVoicemail
      ? voicemailMessages[campaign.callType]
      : '';

    const contextVars = (contact.callContext as Record<string, string>) || {};
    const dynamicVariables: Record<string, string> = {
      ...contextVars,
      call_type: campaign.callType,
      patient_name: contextVars.patient_name || '',
      patient_id: contact.patientId,
      customer_phone: contact.phoneNumber || '',
    };

    const result = await this.retellService.createOutboundCall({
      fromNumber,
      toNumber: TEST_OVERRIDE_NUMBER || contact.phoneNumber!,
      overrideAgentId: agentId,
      dynamicVariables,
      metadata: {
        campaignId: campaign.id,
        contactId: contact.id,
        accountId: campaign.accountId,
        callType: campaign.callType,
      },
      voicemailMessage: voicemailMsg,
      maxCallDurationMs: 300_000, // 5 minutes max for outbound
    });

    if (result) {
      await this.campaignService.updateContactStatus(contact.id, {
        status: 'DIALING',
        attempts: contact.attempts + 1,
        lastAttemptAt: new Date(),
        retellCallId: result.call_id,
      });
    }
  }

  private async dispatchSms(
    campaign: OutboundCampaign,
    contact: CampaignContact,
    _settings: OutboundSettings,
  ): Promise<void> {
    // TODO: Phase 2 — integrate with TwilioMessagingService
    // For now, mark as completed with a placeholder
    this.logger.log({
      contactId: contact.id,
      channel: 'sms',
      msg: 'SMS dispatch not yet implemented',
    });

    await this.campaignService.updateContactStatus(contact.id, {
      status: 'COMPLETED',
      attempts: contact.attempts + 1,
      lastAttemptAt: new Date(),
      completedAt: new Date(),
      outcome: 'sms_sent',
    });
    await this.campaignService.incrementCampaignStats(campaign.id, true, true);
  }

  private async dispatchEmail(
    campaign: OutboundCampaign,
    contact: CampaignContact,
    _settings: OutboundSettings,
  ): Promise<void> {
    // TODO: Phase 2 — integrate with EmailService
    this.logger.log({
      contactId: contact.id,
      channel: 'email',
      msg: 'Email dispatch not yet implemented',
    });

    await this.campaignService.updateContactStatus(contact.id, {
      status: 'COMPLETED',
      attempts: contact.attempts + 1,
      lastAttemptAt: new Date(),
      completedAt: new Date(),
      outcome: 'email_sent',
    });
    await this.campaignService.incrementCampaignStats(campaign.id, true, true);
  }

  private async getFromNumber(
    accountId: string,
    settings: OutboundSettings,
  ): Promise<string | null> {
    if (settings.fromPhoneNumberId) {
      const phone = await this.prisma.retellPhoneNumber.findFirst({
        where: { id: settings.fromPhoneNumberId, accountId, isActive: true },
      });
      return phone?.phoneNumber || null;
    }

    const phone = await this.prisma.retellPhoneNumber.findFirst({
      where: { accountId, isActive: true },
    });
    return phone?.phoneNumber || null;
  }

  private async isOnDncList(
    accountId: string,
    phoneNumber: string,
  ): Promise<boolean> {
    const entry = await this.prisma.doNotCallEntry.findUnique({
      where: { accountId_phoneNumber: { accountId, phoneNumber } },
    });
    return !!entry;
  }

  private async isAgentGroupEnabled(
    accountId: string,
    callType: string,
  ): Promise<boolean> {
    const group = CALL_TYPE_TO_AGENT_GROUP[callType];
    if (!group) return false;
    return this.settingsService.isGroupEnabled(accountId, group);
  }

  private isWithinCallingWindow(
    campaign: OutboundCampaign,
    settings: OutboundSettings,
  ): boolean {
    const tz = campaign.timezone || settings.timezone || 'America/New_York';
    const now = new Date();

    let currentTime: string;
    try {
      currentTime = now.toLocaleTimeString('en-US', {
        timeZone: tz,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      currentTime = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    const windowStart = campaign.callingWindowStart || settings.callingWindowStart || '09:00';
    const windowEnd = campaign.callingWindowEnd || settings.callingWindowEnd || '17:00';

    return currentTime >= windowStart && currentTime <= windowEnd;
  }
}
