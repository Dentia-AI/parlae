'use server';

import { z } from 'zod';
import { enhanceAction } from '@kit/next/actions';
import { getLogger } from '@kit/shared/logger';
import { prisma } from '@kit/prisma';
import { createTwilioService } from '@kit/shared/twilio/server';

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
      // Just save the port request information
      // Actual porting is handled through Twilio support and doesn't require immediate payment
      // Payment will be required when deploying the AI receptionist
      
      // Store port request information
      await prisma.account.update({
        where: { id: data.accountId },
        data: {
          phoneIntegrationMethod: 'ported',
          phoneIntegrationSettings: {
            businessName: data.businessName,
            phoneNumber: data.phoneNumber,
            currentCarrier: data.currentCarrier,
            accountNumber: data.accountNumber,
            portStatus: 'pending_configuration', // Not submitted yet, just configured
            configuredAt: new Date().toISOString(),
          },
        },
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

    logger.info(
      { userId: user.id, clinicNumber: data.clinicNumber },
      '[Phone Integration] Saving forwarded number configuration'
    );

    try {
      // Just save the configuration - don't purchase anything yet
      // The actual phone number purchase will happen during deployment after payment
      await prisma.account.update({
        where: { id: data.accountId },
        data: {
          phoneIntegrationMethod: 'forwarded',
          phoneIntegrationSettings: {
            businessName: data.businessName,
            clinicNumber: data.clinicNumber,
            staffDirectNumber: data.staffDirectNumber || null,
            forwardingType: data.forwardingType || 'all',
            needsPhoneNumber: true,
            configuredAt: new Date().toISOString(),
          },
        },
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

    logger.info(
      { userId: user.id, clinicNumber: data.clinicNumber, pbxType: data.pbxType },
      '[Phone Integration] Setting up SIP trunk configuration'
    );

    try {
      // Generate SIP credentials for user's PBX
      // User's existing number routes through SIP trunk to Twilio/Vapi
      // We still need a Twilio number to attach the Vapi assistant to
      
      const sipUsername = `sip_${data.accountId.substring(0, 8)}`;
      const sipPassword = generateSecurePassword();
      const sipUrl = `sip:${sipUsername}@sip.twilio.com`;

      // TODO: Create actual SIP trunk in Twilio during deployment
      
      // Store SIP configuration
      await prisma.account.update({
        where: { id: data.accountId },
        data: {
          phoneIntegrationMethod: 'sip',
          phoneIntegrationSettings: {
            businessName: data.businessName,
            clinicNumber: data.clinicNumber, // User's existing number on their PBX
            pbxType: data.pbxType,
            sipUrl,
            sipUsername,
            sipPassword, // In production, encrypt this!
            needsPhoneNumber: true, // We need a Twilio number for the Vapi endpoint
            configuredAt: new Date().toISOString(),
          },
        },
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
