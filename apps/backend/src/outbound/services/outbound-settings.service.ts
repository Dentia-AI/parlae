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
    return this.prisma.outboundSettings.findUnique({
      where: { accountId },
    });
  }

  async getOrCreateSettings(accountId: string): Promise<OutboundSettings> {
    const existing = await this.prisma.outboundSettings.findUnique({
      where: { accountId },
    });
    if (existing) return existing;

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { brandingTimezone: true },
    });

    return this.prisma.outboundSettings.create({
      data: {
        accountId,
        timezone: account?.brandingTimezone || 'America/New_York',
      },
    });
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
  ): 'phone' | 'sms' | 'email' {
    const defaults = (settings.channelDefaults as Record<string, string>) || {};
    return (defaults[callType] as 'phone' | 'sms' | 'email') || 'phone';
  }
}
