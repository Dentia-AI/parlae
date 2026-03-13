'use server';

import { z } from 'zod';
import { enhanceAction } from '@kit/next/actions';
import { getLogger } from '@kit/shared/logger';
import { prisma } from '@kit/prisma';
import { createTwilioService } from '@kit/shared/twilio/server';

/**
 * Normalize a phone number to E.164 format for NANP numbers.
 * Handles raw 10-digit, 11-digit with leading 1, and already-prefixed +1 formats.
 */
function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) return phone;
  return phone;
}

// Schemas
const SetupPortedNumberSchema = z.object({
  accountId: z.string(),
  phoneNumber: z.string(),
  currentCarrier: z.string(),
  accountNumber: z.string().optional(),
  businessName: z.string(),
});

const SetupForwardedNumberSchema = z.object({
  accountId: z.string(),
  clinicNumber: z.string(),
  staffDirectNumber: z.string().optional(),
  forwardingType: z.enum(['all', 'conditional']).optional().default('all'),
  businessName: z.string(),
});

const SetupSipTrunkSchema = z.object({
  accountId: z.string(),
  clinicNumber: z.string(),
  pbxType: z.string(),
  businessName: z.string(),
});

/**
 * Setup Ported Number Integration
 * Saves port request configuration - actual porting happens through Twilio support
 * No payment verification needed as this just saves configuration
 */
export const setupPortedNumberAction = enhanceAction(
  async (data, user) => {
    const logger = await getLogger();

    logger.info(
      { userId: user.id, phoneNumber: data.phoneNumber },
      '[Phone Integration] Saving ported number configuration'
    );

    try {
      const existing = await prisma.account.findUnique({
        where: { id: data.accountId },
        select: { phoneIntegrationSettings: true },
      });
      const existingSettings = (existing?.phoneIntegrationSettings as Record<string, unknown>) || {};

      const normalizedPhone = normalizePhoneNumber(data.phoneNumber);
      const updateData: Record<string, unknown> = {
        phoneIntegrationMethod: 'ported',
        phoneIntegrationSettings: {
          ...existingSettings,
          businessName: data.businessName,
          phoneNumber: normalizedPhone,
          currentCarrier: data.currentCarrier,
          accountNumber: data.accountNumber,
          portStatus: 'pending_configuration',
          configuredAt: new Date().toISOString(),
        },
      };

      if (normalizedPhone) {
        updateData.brandingContactPhone = normalizedPhone;
      }
      if (data.businessName) {
        updateData.brandingBusinessName = data.businessName;
      }

      await prisma.account.update({
        where: { id: data.accountId },
        data: updateData,
      });

      logger.info(
        { accountId: data.accountId, phoneNumber: data.phoneNumber },
        '[Phone Integration] Port configuration saved (actual port will be initiated after payment)'
      );

      return {
        success: true,
        portStatus: 'configured',
        message: 'Configuration saved. Port request will be submitted after payment.',
        estimatedCompletionDays: 14,
      };
    } catch (error) {
      logger.error(
        { error, userId: user.id },
        '[Phone Integration] Failed to setup ported number'
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit port request',
      };
    }
  },
  {
    auth: true,
    schema: SetupPortedNumberSchema,
  }
);

/**
 * Setup Forwarded Number Integration
 * Provisions a Twilio number for the clinic to forward calls to
 */
export const setupForwardedNumberAction = enhanceAction(
  async (data, user) => {
    const logger = await getLogger();

    const normalizedClinic = normalizePhoneNumber(data.clinicNumber);

    logger.info(
      { userId: user.id, clinicNumber: data.clinicNumber, normalized: normalizedClinic },
      '[Phone Integration] Saving forwarded number configuration'
    );

    try {
      const existing = await prisma.account.findUnique({
        where: { id: data.accountId },
        select: { phoneIntegrationSettings: true },
      });
      const existingSettings = (existing?.phoneIntegrationSettings as Record<string, unknown>) || {};

      const updateData: Record<string, unknown> = {
        phoneIntegrationMethod: 'forwarded',
        phoneIntegrationSettings: {
          ...existingSettings,
          businessName: data.businessName,
          clinicNumber: normalizedClinic,
          staffDirectNumber: data.staffDirectNumber || null,
          forwardingType: data.forwardingType || 'all',
          needsPhoneNumber: true,
          configuredAt: new Date().toISOString(),
        },
      };

      if (normalizedClinic) {
        updateData.brandingContactPhone = normalizedClinic;
      }
      if (data.businessName) {
        updateData.brandingBusinessName = data.businessName;
      }

      await prisma.account.update({
        where: { id: data.accountId },
        data: updateData,
      });

      logger.info(
        { accountId: data.accountId },
        '[Phone Integration] Forwarding configuration saved (number will be purchased after payment)'
      );

      return {
        success: true,
        message: 'Configuration saved. Phone number will be provisioned after payment.',
      };
    } catch (error) {
      logger.error(
        { error, userId: user.id },
        '[Phone Integration] Failed to setup forwarded number'
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to setup forwarding',
      };
    }
  },
  {
    auth: true,
    schema: SetupForwardedNumberSchema,
  }
);

/**
 * Setup SIP Trunk Integration
 * Generates SIP credentials for PBX integration
 * Note: Still requires a Twilio phone number to attach the Vapi assistant to
 */
export const setupSipTrunkAction = enhanceAction(
  async (data, user) => {
    const logger = await getLogger();

    const normalizedClinic = normalizePhoneNumber(data.clinicNumber);

    logger.info(
      { userId: user.id, clinicNumber: data.clinicNumber, normalized: normalizedClinic, pbxType: data.pbxType },
      '[Phone Integration] Setting up SIP trunk configuration'
    );

    try {
      const sipUsername = `sip_${data.accountId.substring(0, 8)}`;
      const sipPassword = generateSecurePassword();
      const sipUrl = `sip:${sipUsername}@sip.twilio.com`;

      const existing = await prisma.account.findUnique({
        where: { id: data.accountId },
        select: { phoneIntegrationSettings: true },
      });
      const existingSettings = (existing?.phoneIntegrationSettings as Record<string, unknown>) || {};

      const sipUpdateData: Record<string, unknown> = {
        phoneIntegrationMethod: 'sip',
        phoneIntegrationSettings: {
          ...existingSettings,
          businessName: data.businessName,
          clinicNumber: normalizedClinic,
          pbxType: data.pbxType,
          sipUrl,
          sipUsername,
          sipPassword,
          needsPhoneNumber: true,
          configuredAt: new Date().toISOString(),
        },
      };

      if (normalizedClinic) {
        sipUpdateData.brandingContactPhone = normalizedClinic;
      }
      if (data.businessName) {
        sipUpdateData.brandingBusinessName = data.businessName;
      }

      await prisma.account.update({
        where: { id: data.accountId },
        data: sipUpdateData,
      });

      logger.info(
        { accountId: data.accountId, sipUsername },
        '[Phone Integration] SIP trunk configuration saved (Twilio number will be provisioned after payment)'
      );

      return {
        success: true,
        sipCredentials: {
          sipUrl,
          username: sipUsername,
          password: sipPassword,
        },
        message: 'SIP credentials generated. Twilio phone number will be provisioned after payment.',
      };
    } catch (error) {
      logger.error(
        { error, userId: user.id },
        '[Phone Integration] Failed to setup SIP trunk'
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to setup SIP trunk',
      };
    }
  },
  {
    auth: true,
    schema: SetupSipTrunkSchema,
  }
);

/**
 * Generate a secure random password for SIP credentials
 */
function generateSecurePassword(length: number = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
