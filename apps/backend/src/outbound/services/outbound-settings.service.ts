import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StructuredLogger } from '../../common/structured-logger';
import type { OutboundSettings, OutboundAgentGroup } from '@kit/prisma';
import { Prisma } from '@kit/prisma';

const DEFAULT_CHANNEL_DEFAULTS: Record<string, string> = {
  recall: 'phone',
  reminder: 'sms',
  followup: 'phone',
  noshow: 'phone',
  treatment_plan: 'phone',
  postop: 'phone',
  reactivation: 'phone',
  survey: 'sms',
  welcome: 'sms',
  payment: 'phone',
  benefits: 'sms',
};

const DEFAULT_FOLLOW_UP_CONFIG = {
  delayDays: 3,
  procedureTypeFilters: ['extraction', 'root_canal', 'implant', 'crown'],
  allVisits: false,
};

const DEFAULT_REACTIVATION_CONFIG = {
  inactiveMonths: 12,
  scanFrequency: 'monthly',
  includeTypes: ['cleaning', 'exam', 'checkup'],
};

const DEFAULT_REMINDER_CONFIG = {
  hoursBeforeAppointment: 24,
};

@Injectable()
export class OutboundSettingsService {
  private readonly logger = new StructuredLogger(OutboundSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(accountId: string): Promise<OutboundSettings | null> {
    try {
      return await this.prisma.outboundSettings.findUnique({
        where: { accountId },
      });
    } catch (err: any) {
      if (err?.message?.includes('auto_approve_campaigns')) {
        const row = await this.prisma.outboundSettings.findUnique({
          where: { accountId },
          select: {
            id: true, accountId: true, patientCareEnabled: true, financialEnabled: true,
            patientCareRetellAgentId: true, financialRetellAgentId: true,
            callingWindowStart: true, callingWindowEnd: true, timezone: true,
            maxConcurrentCalls: true, fromPhoneNumberId: true, channelDefaults: true,
            followUpConfig: true, reactivationConfig: true, reminderConfig: true,
            leaveVoicemail: true, maxRetries: true, retryDelayMinutes: true,
            outboundTemplateVersion: true, outboundUpgradeHistory: true,
            createdAt: true, updatedAt: true,
          },
        });
        if (!row) return null;
        return { ...row, autoApproveCampaigns: false } as OutboundSettings;
      }
      throw err;
    }
  }

  async getOrCreateSettings(accountId: string): Promise<OutboundSettings> {
    const existing = await this.getSettings(accountId);
    if (existing) return existing;

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { brandingTimezone: true },
    });

    try {
      return await this.prisma.outboundSettings.create({
        data: {
          accountId,
          timezone: account?.brandingTimezone || 'America/New_York',
        },
      });
    } catch (err: any) {
      if (err?.message?.includes('auto_approve_campaigns')) {
        const tz = account?.brandingTimezone || 'America/New_York';
        await this.prisma.$executeRaw`INSERT INTO outbound_settings (account_id, timezone) VALUES (${accountId}, ${tz}) ON CONFLICT (account_id) DO NOTHING`;
        const created = await this.getSettings(accountId);
        return created!;
      }
      throw err;
    }
  }

  async updateSettings(
    accountId: string,
    data: Partial<Pick<
      OutboundSettings,
      | 'callingWindowStart'
      | 'callingWindowEnd'
      | 'timezone'
      | 'maxConcurrentCalls'
      | 'fromPhoneNumberId'
      | 'channelDefaults'
      | 'followUpConfig'
      | 'reactivationConfig'
      | 'reminderConfig'
      | 'leaveVoicemail'
      | 'maxRetries'
      | 'retryDelayMinutes'
    >>,
  ): Promise<OutboundSettings> {
    return this.prisma.outboundSettings.upsert({
      where: { accountId },
      update: data as Prisma.OutboundSettingsUncheckedUpdateInput,
      create: { accountId, ...data } as Prisma.OutboundSettingsUncheckedCreateInput,
    });
  }

  /**
   * Enable an agent group and apply smart defaults (auto-bootstrap).
   * Returns the updated settings.
   */
  async enableAgentGroup(
    accountId: string,
    group: 'PATIENT_CARE' | 'FINANCIAL',
  ): Promise<OutboundSettings> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { brandingTimezone: true },
    });
    const tz = account?.brandingTimezone || 'America/New_York';

    const settings = await this.getOrCreateSettings(accountId);
    const existingChannelDefaults = (settings.channelDefaults as Record<string, string>) || {};

    const updateData: Record<string, unknown> = {};

    if (group === 'PATIENT_CARE') {
      updateData.patientCareEnabled = true;
      updateData.timezone = tz;
      updateData.channelDefaults = {
        ...DEFAULT_CHANNEL_DEFAULTS,
        ...existingChannelDefaults,
      };
      updateData.followUpConfig = DEFAULT_FOLLOW_UP_CONFIG;
      updateData.reactivationConfig = DEFAULT_REACTIVATION_CONFIG;
      updateData.reminderConfig = DEFAULT_REMINDER_CONFIG;
    } else {
      updateData.financialEnabled = true;
      updateData.timezone = tz;
      updateData.channelDefaults = {
        ...DEFAULT_CHANNEL_DEFAULTS,
        ...existingChannelDefaults,
      };
    }

    this.logger.log({
      accountId,
      group,
      msg: `Enabling outbound agent group with smart defaults`,
    });

    return this.prisma.outboundSettings.update({
      where: { accountId },
      data: updateData,
    });
  }

  async disableAgentGroup(
    accountId: string,
    group: 'PATIENT_CARE' | 'FINANCIAL',
  ): Promise<OutboundSettings> {
    const field =
      group === 'PATIENT_CARE' ? 'patientCareEnabled' : 'financialEnabled';

    return this.prisma.outboundSettings.update({
      where: { accountId },
      data: { [field]: false },
    });
  }

  async isGroupEnabled(
    accountId: string,
    group: 'PATIENT_CARE' | 'FINANCIAL',
  ): Promise<boolean> {
    const settings = await this.getSettings(accountId);
    if (!settings) return false;
    return group === 'PATIENT_CARE'
      ? settings.patientCareEnabled
      : settings.financialEnabled;
  }

  getChannelForCallType(
    settings: OutboundSettings,
    callType: string,
  ): 'none' | 'phone' | 'sms' | 'email' {
    const defaults = (settings.channelDefaults as Record<string, string>) || {};
    const val = defaults[callType];
    if (val === 'none') return 'none';
    return (val as 'phone' | 'sms' | 'email') || 'phone';
  }
}
