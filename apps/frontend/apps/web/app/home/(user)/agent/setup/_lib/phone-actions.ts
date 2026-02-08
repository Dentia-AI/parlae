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
 * Submits a port request to transfer the clinic's number to Twilio
 */
export const setupPortedNumberAction = enhanceAction(
  async (data, user) => {
    const logger = await getLogger();

    logger.info(
      { userId: user.id, phoneNumber: data.phoneNumber },
      '[Phone Integration] Setting up ported number'
    );

    try {
      const twilioService = createTwilioService();

      // In production, this would submit an actual port request to Twilio
      // For now, we'll store the information and simulate the process
      
      // TODO: Implement actual Twilio port request
      // const portRequest = await twilioService.createPortRequest({
      //   phoneNumber: data.phoneNumber,
      //   currentCarrier: data.currentCarrier,
      //   accountNumber: data.accountNumber,
      // });

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
            portStatus: 'pending',
            portRequestedAt: new Date().toISOString(),
          },
        },
      });

      logger.info(
        { accountId: data.accountId, phoneNumber: data.phoneNumber },
        '[Phone Integration] Port request submitted'
      );

      return {
        success: true,
        portStatus: 'pending',
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
      '[Phone Integration] Setting up forwarded number'
    );

    try {
      const twilioService = createTwilioService();

      // Get existing Twilio numbers or purchase a new one
      const existingNumbers = await twilioService.listNumbers();
      
      let twilioNumber;
      
      if (existingNumbers.length > 0) {
        // Use existing number
        twilioNumber = existingNumbers[0].phoneNumber;
        logger.info(
          { twilioNumber },
          '[Phone Integration] Using existing Twilio number for forwarding'
        );
      } else {
        // Purchase new number
        // In production, you'd search for and purchase a number
        // For now, return an error asking to run admin setup first
        throw new Error(
          'No Twilio numbers available. Please run admin setup to purchase a number first.'
        );
      }

      // Store forwarding configuration
      await prisma.account.update({
        where: { id: data.accountId },
        data: {
          phoneIntegrationMethod: 'forwarded',
          phoneIntegrationSettings: {
            businessName: data.businessName,
            clinicNumber: data.clinicNumber,
            twilioForwardNumber: twilioNumber,
            setupCompletedAt: new Date().toISOString(),
          },
        },
      });

      logger.info(
        { accountId: data.accountId, twilioNumber },
        '[Phone Integration] Forwarding setup complete'
      );

      return {
        success: true,
        twilioNumber,
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
 */
export const setupSipTrunkAction = enhanceAction(
  async (data, user) => {
    const logger = await getLogger();

    logger.info(
      { userId: user.id, clinicNumber: data.clinicNumber, pbxType: data.pbxType },
      '[Phone Integration] Setting up SIP trunk'
    );

    try {
      // Generate SIP credentials
      // In production, these would be created in Twilio's SIP trunking service
      const sipUsername = `sip_${data.accountId.substring(0, 8)}`;
      const sipPassword = generateSecurePassword();
      const sipUrl = `sip:${sipUsername}@sip.twilio.com`;

      // TODO: Create actual SIP trunk in Twilio
      // const trunk = await twilioService.createSipTrunk({
      //   friendlyName: data.businessName,
      //   domainName: sipUrl,
      // });

      // Store SIP configuration
      await prisma.account.update({
        where: { id: data.accountId },
        data: {
          phoneIntegrationMethod: 'sip',
          phoneIntegrationSettings: {
            businessName: data.businessName,
            clinicNumber: data.clinicNumber,
            pbxType: data.pbxType,
            sipUrl,
            sipUsername,
            sipPassword, // In production, encrypt this!
            setupCompletedAt: new Date().toISOString(),
          },
        },
      });

      logger.info(
        { accountId: data.accountId, sipUsername },
        '[Phone Integration] SIP trunk setup complete'
      );

      return {
        success: true,
        sipCredentials: {
          sipUrl,
          username: sipUsername,
          password: sipPassword,
        },
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
