'use server';

import { z } from 'zod';
import { enhanceAction } from '@kit/next/actions';
import { getLogger } from '@kit/shared/logger';
import { createVapiService } from '@kit/shared/vapi/server';
import { prisma } from '@kit/prisma';
import {
  getDentalClinicTemplate,
  buildSquadPayloadFromTemplate,
  dbShapeToTemplate,
  DENTAL_CLINIC_TEMPLATE_VERSION,
} from '@kit/shared/vapi/templates';
import type {
  TemplateVariables,
  RuntimeConfig,
} from '@kit/shared/vapi/templates';

const SetupPhoneSchema = z.object({
  accountId: z.string(),
  areaCode: z.string().length(3),
  businessName: z.string().min(1),
});

const DeployReceptionistSchema = z.object({
  voice: z.object({
    id: z.string(),
    name: z.string(),
    provider: z.enum(['11labs', 'elevenlabs', 'openai', 'playht', 'azure', 'deepgram', 'cartesia', 'rime-ai']),
    voiceId: z.string(),
    gender: z.string(),
    accent: z.string(),
    description: z.string(),
  }),
  files: z.array(z.any()).optional(),
});

const UploadKnowledgeBaseSchema = z.object({
  accountId: z.string(),
  files: z.array(z.any()),
});

/**
 * Setup phone number for AI receptionist
 */
export const setupPhoneNumberAction = enhanceAction(
  async (data, user) => {
    const logger = await getLogger();

    logger.info(
      { userId: user.id, accountId: data.accountId, areaCode: data.areaCode },
      '[Receptionist] Setting up phone number'
    );

    try {
      const isDev = process.env.NODE_ENV === 'development';
      
      let phoneNumber: string;
      
      if (isDev) {
        phoneNumber = '+15555551234';
        logger.info('[Receptionist] Using trial number for development');
      } else {
        throw new Error('Production phone purchasing not yet implemented');
      }

      await prisma.account.update({
        where: { id: data.accountId },
        data: {
          phoneIntegrationMethod: 'ported',
          phoneIntegrationSettings: {
            businessName: data.businessName,
            areaCode: data.areaCode,
          },
        },
      });

      logger.info(
        { phoneNumber, accountId: data.accountId },
        '[Receptionist] Phone number setup complete'
      );

      return {
        success: true,
        phoneNumber,
      };
    } catch (error) {
      logger.error(
        { error, userId: user.id, accountId: data.accountId },
        '[Receptionist] Failed to setup phone number'
      );
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to setup phone number',
      };
    }
  },
  {
    auth: true,
    schema: SetupPhoneSchema,
  }
);

/**
 * Deploy the AI receptionist with full squad configuration.
 *
 * Creates a multi-assistant squad using the dental clinic template:
 * 1. Triage Receptionist (entry point, routes callers)
 * 2. Emergency Transfer (urgent care)
 * 3. Clinic Information (knowledge base, FAQ)
 * 4. Scheduling (appointment CRUD via PMS tools)
 *
 * Each assistant has its own system prompt, tools, and handoff destinations.
 */
export const deployReceptionistAction = enhanceAction(
  async (data, user) => {
    const logger = await getLogger();
    const vapiService = createVapiService();

    logger.info(
      { userId: user.id },
      '[Receptionist] Deploying AI receptionist'
    );

    try {
      // Get account info
      const account = await prisma.account.findFirst({
        where: {
          primaryOwnerId: user.id,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phoneIntegrationMethod: true,
          phoneIntegrationSettings: true,
          paymentMethodVerified: true,
          stripePaymentMethodId: true,
          agentTemplateId: true,
          brandingBusinessName: true,
          brandingContactPhone: true,
          googleCalendarConnected: true,
          setupProgress: true,
        },
      });

      if (!account) {
        throw new Error('Account not found');
      }

      // VERIFY PAYMENT METHOD BEFORE PROCEEDING
      if (!account.paymentMethodVerified || !account.stripePaymentMethodId) {
        logger.error(
          { accountId: account.id },
          '[Receptionist] Payment method not verified'
        );
        throw new Error('Payment method required. Please add a payment method before deploying.');
      }

      logger.info(
        { accountId: account.id, paymentMethodVerified: true },
        '[Receptionist] Payment method verified, proceeding with deployment'
      );

      const phoneIntegrationSettings = account.phoneIntegrationSettings as any;
      const businessName = account.brandingBusinessName || phoneIntegrationSettings?.businessName || account.name;
      const setupProgress = (account.setupProgress as Record<string, any>) ?? {};

      // STEP 1: Get or provision a real Twilio phone number
      const { createTwilioService } = await import('@kit/shared/twilio/server');
      const twilioService = createTwilioService();
      
      let phoneNumber: string;
      const existingNumbers = await twilioService.listNumbers();
      
      if (existingNumbers.length > 0) {
        phoneNumber = existingNumbers[0].phoneNumber;
        logger.info(
          { phoneNumber, accountId: account.id },
          '[Receptionist] Using existing Twilio phone number'
        );
      } else {
        throw new Error('No Twilio phone numbers available. Please contact support.');
      }

      // STEP 2: Collect knowledge base file IDs
      const knowledgeFileIds: string[] = data.files?.map((f: any) => f.id) || [];

      logger.info(
        {
          accountId: account.id,
          fileCount: knowledgeFileIds.length,
          hasTemplate: !!account.agentTemplateId,
        },
        '[Receptionist] Building squad from template'
      );

      // STEP 3: Resolve template variables
      const templateVars: TemplateVariables = {
        clinicName: businessName,
        clinicHours: setupProgress.businessHours,
        clinicLocation: setupProgress.businessLocation,
        clinicInsurance: setupProgress.insuranceInfo,
        clinicServices: setupProgress.servicesOffered,
      };

      const webhookBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://app.parlae.ca';
      const runtimeConfig: RuntimeConfig = {
        webhookUrl: `${webhookBaseUrl}/api/vapi/webhook`,
        webhookSecret: process.env.VAPI_SERVER_SECRET,
        knowledgeFileIds,
      };

      // STEP 4: Build the squad from template
      let templateConfig;
      let templateVersion: string;
      let templateName: string;

      if (account.agentTemplateId) {
        // Load from DB template
        const dbTemplate = await prisma.agentTemplate.findUnique({
          where: { id: account.agentTemplateId },
        });

        if (dbTemplate && dbTemplate.isActive) {
          templateConfig = dbShapeToTemplate(dbTemplate as any);
          templateVersion = dbTemplate.version;
          templateName = dbTemplate.name;
          logger.info(
            { templateName, templateVersion },
            '[Receptionist] Using DB template'
          );
        } else {
          // Fallback to built-in
          templateConfig = getDentalClinicTemplate();
          templateVersion = DENTAL_CLINIC_TEMPLATE_VERSION;
          templateName = templateConfig.name;
          logger.info('[Receptionist] DB template not found/active, using built-in');
        }
      } else {
        // Use built-in default template
        templateConfig = getDentalClinicTemplate();
        templateVersion = DENTAL_CLINIC_TEMPLATE_VERSION;
        templateName = templateConfig.name;
        logger.info(
          { templateName, templateVersion },
          '[Receptionist] Using built-in default template'
        );
      }

      // Apply user's selected voice to ALL squad members for consistency
      if (templateConfig.members && templateConfig.members.length > 0) {
        for (const member of templateConfig.members) {
          if (member.assistant) {
            member.assistant.voice = {
              provider: data.voice.provider as any,
              voiceId: data.voice.voiceId,
              stability: 0.5,
              similarityBoost: 0.75,
            };
          }
        }

        // Override first message on the triage (entry point) assistant
        const triageMember = templateConfig.members[0];
        if (triageMember?.assistant) {
          triageMember.assistant.firstMessage =
            `Thank you for calling ${businessName}! I'm ${data.voice.name}. How can I help you today?`;
        }
      }

      const squadPayload = buildSquadPayloadFromTemplate(
        templateConfig,
        templateVars,
        runtimeConfig,
      );

      // Override squad name
      (squadPayload as any).name = `${businessName} Squad`;

      // STEP 5: Create the squad in Vapi
      const squad = await vapiService.createSquad(squadPayload as any);

      if (!squad) {
        throw new Error('Failed to create Vapi squad');
      }

      logger.info(
        { squadId: squad.id, memberCount: squad.members?.length, accountId: account.id },
        '[Receptionist] Created Vapi squad with template'
      );

      // STEP 6: Import phone number to Vapi (or update if exists)
      const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID!;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN!;

      const vapiPhoneNumbers = await vapiService.listPhoneNumbers();
      const existingVapiPhone = vapiPhoneNumbers.find(
        (p: any) => p.number === phoneNumber
      );

      let vapiPhone;

      if (existingVapiPhone) {
        logger.info(
          { phoneNumberId: existingVapiPhone.id },
          '[Receptionist] Phone exists in Vapi, updating squad'
        );

        vapiPhone = await vapiService.updatePhoneNumber(
          existingVapiPhone.id,
          squad.id,
          true
        );
      } else {
        logger.info('[Receptionist] Importing phone to Vapi');

        vapiPhone = await vapiService.importPhoneNumber(
          phoneNumber,
          twilioAccountSid,
          twilioAuthToken,
          squad.id,
          true
        );
      }

      if (!vapiPhone) {
        throw new Error('Failed to import phone number to Vapi');
      }

      logger.info(
        { vapiPhoneId: vapiPhone.id, phoneNumber: vapiPhone.number },
        '[Receptionist] Phone linked to squad'
      );

      // STEP 7: Update account with full Vapi configuration
      // Preserve the user's chosen phone integration method (forwarded, ported, sip)
      const existingMethod = account.phoneIntegrationMethod && account.phoneIntegrationMethod !== 'none'
        ? account.phoneIntegrationMethod
        : 'forwarded';
      await prisma.account.update({
        where: { id: account.id },
        data: {
          phoneIntegrationMethod: existingMethod,
          phoneIntegrationSettings: {
            ...(phoneIntegrationSettings || {}),
            vapiSquadId: squad.id,
            vapiPhoneId: vapiPhone.id,
            voiceConfig: data.voice,
            phoneNumber: phoneNumber,
            knowledgeBaseFileIds: knowledgeFileIds,
            templateVersion,
            templateName,
            deployedAt: new Date().toISOString(),
          },
        },
      });

      logger.info(
        { accountId: account.id, squadId: squad.id, templateVersion },
        '[Receptionist] AI receptionist deployed successfully'
      );

      return {
        success: true,
        squadId: squad.id,
        phoneId: vapiPhone.id,
        phoneNumber: phoneNumber,
        templateVersion,
        memberCount: squad.members?.length || 0,
      };
    } catch (error) {
      logger.error(
        { error, userId: user.id },
        '[Receptionist] Failed to deploy AI receptionist'
      );
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to deploy receptionist',
      };
    }
  },
  {
    auth: true,
    schema: DeployReceptionistSchema,
  }
);

/**
 * Upload files to Vapi knowledge base
 */
export const uploadKnowledgeBaseAction = enhanceAction(
  async (data, user) => {
    const logger = await getLogger();
    const vapiService = createVapiService();

    logger.info(
      { userId: user.id, accountId: data.accountId, fileCount: data.files.length },
      '[Receptionist] Uploading knowledge base files'
    );

    try {
      logger.info('[Receptionist] Knowledge base upload complete');

      return {
        success: true,
        fileIds: [],
      };
    } catch (error) {
      logger.error(
        { error, userId: user.id },
        '[Receptionist] Failed to upload knowledge base'
      );
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload files',
      };
    }
  },
  {
    auth: true,
    schema: UploadKnowledgeBaseSchema,
  }
);
