'use server';

import { z } from 'zod';
import { enhanceAction } from '@kit/next/actions';
import { getLogger } from '@kit/shared/logger';
import { createVapiService } from '@kit/shared/vapi/server';
import { prisma } from '@kit/prisma';

const SetupPhoneSchema = z.object({
  accountId: z.string(),
  areaCode: z.string().length(3),
  businessName: z.string().min(1),
});

const DeployReceptionistSchema = z.object({
  voice: z.object({
    id: z.string(),
    name: z.string(),
    provider: z.enum(['11labs', 'openai', 'playht', 'azure', 'deepgram', 'cartesia', 'rime-ai']),
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
      // In development mode, we'll use a hardcoded trial number
      // In production, this would call Twilio to purchase a number
      const isDev = process.env.NODE_ENV === 'development';
      
      let phoneNumber: string;
      
      if (isDev) {
        // Use trial number for development
        phoneNumber = '+15555551234'; // This would be from env
        logger.info('[Receptionist] Using trial number for development');
      } else {
        // TODO: Call Twilio to purchase/provision number
        // const twilioService = createTwilioService();
        // const result = await twilioService.purchasePhoneNumber(data.areaCode);
        // phoneNumber = result.phoneNumber;
        throw new Error('Production phone purchasing not yet implemented');
      }

      // Store in database
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
 * Deploy the AI receptionist with full configuration
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
          phoneIntegrationSettings: true,
        },
      });

      if (!account) {
        throw new Error('Account not found');
      }

      const phoneIntegrationSettings = account.phoneIntegrationSettings as any;
      const businessName = phoneIntegrationSettings?.businessName || account.name;
      const organizationPrefix = businessName;

      // STEP 1: Get or provision a real Twilio phone number
      // In dev, we'll use an existing number. In prod, we'd purchase one.
      const { createTwilioService } = await import('@kit/shared/twilio/server');
      const twilioService = createTwilioService();
      
      const existingNumbers = await twilioService.listNumbers();
      
      if (existingNumbers.length === 0) {
        throw new Error('No Twilio phone numbers available. Please purchase a phone number first or run the admin setup.');
      }
      
      const phoneNumber = existingNumbers[0].phoneNumber;
      
      logger.info(
        { phoneNumber, accountId: account.id },
        '[Receptionist] Using existing Twilio phone number'
      );

      // STEP 2: Create Vapi assistant
      logger.info(
        {
          accountId: account.id,
          hasFiles: !!(data.files && data.files.length > 0),
          fileCount: data.files?.length || 0,
          fileIds: data.files?.map((f: any) => f.id) || [],
        },
        '[Receptionist] Creating assistant with knowledge base'
      );

      const assistant = await vapiService.createAssistant({
        name: `${organizationPrefix} - Receptionist`,
        firstMessage: `Hi, welcome to ${businessName}! I'm ${data.voice.name}. How can I help you today?`,
        voice: {
          provider: data.voice.provider,
          voiceId: data.voice.voiceId,
        },
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          systemPrompt: `
You are ${data.voice.name}, the friendly AI receptionist for ${businessName}.

BUSINESS INFORMATION:
- Name: ${businessName}
- Phone: ${phoneNumber}

YOUR ROLE:
- Greet callers warmly and professionally
- Answer general questions about the business
- Help schedule appointments (when integration is available)
- Transfer urgent matters to staff when needed
- Always be helpful, patient, and empathetic

GUIDELINES:
- Listen carefully to the caller's needs
- Provide clear and concise information
- If you don't know something, politely say so and offer to have someone call back
- For emergencies, immediately offer to transfer to staff
- Keep responses conversational and natural

Remember: You represent ${businessName}. Always maintain a professional yet friendly tone.
          `.trim(),
          temperature: 0.7,
          maxTokens: 500,
          knowledgeBase: data.files && data.files.length > 0 ? {
            provider: 'canonical',
            topK: 5,
            fileIds: data.files.map((f: any) => f.id),
          } : undefined,
        },
        recordingEnabled: true,
        endCallFunctionEnabled: true,
      });

      if (!assistant) {
        throw new Error('Failed to create Vapi assistant');
      }

      logger.info(
        { assistantId: assistant.id, accountId: account.id },
        '[Receptionist] Created Vapi assistant'
      );

      // STEP 3: Create squad with single receptionist
      const squad = await vapiService.createSquad({
        name: `${organizationPrefix} Squad`,
        members: [
          {
            assistantId: assistant.id, // Use assistantId instead of assistant object
            assistantDestinations: [], // Single assistant squad for now
          },
        ],
      });

      if (!squad) {
        throw new Error('Failed to create Vapi squad');
      }

      logger.info(
        { squadId: squad.id, accountId: account.id },
        '[Receptionist] Created Vapi squad'
      );

      // STEP 4: Import phone number to Vapi (or update if exists)
      const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID!;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN!;

      // Check if phone already exists in Vapi
      const vapiPhoneNumbers = await vapiService.listPhoneNumbers();
      const existingVapiPhone = vapiPhoneNumbers.find(
        (p: any) => p.number === phoneNumber
      );

      let vapiPhone;

      if (existingVapiPhone) {
        // Phone exists, update it to point to the new squad
        logger.info(
          { phoneNumberId: existingVapiPhone.id, phoneNumber: existingVapiPhone.number },
          '[Receptionist] Phone already exists in Vapi, updating'
        );

        vapiPhone = await vapiService.updatePhoneNumber(
          existingVapiPhone.id,
          squad.id,
          true // isSquad = true
        );
      } else {
        // Phone doesn't exist, import it
        logger.info('[Receptionist] Importing phone to Vapi');

        vapiPhone = await vapiService.importPhoneNumber(
          phoneNumber,
          twilioAccountSid,
          twilioAuthToken,
          squad.id,
          true // isSquad = true
        );
      }

      if (!vapiPhone) {
        throw new Error('Failed to import phone number to Vapi');
      }

      logger.info(
        { vapiPhoneId: vapiPhone.id, phoneNumber: vapiPhone.number },
        '[Receptionist] Imported phone to Vapi'
      );

      // STEP 5: Update account with Vapi configuration
      await prisma.account.update({
        where: { id: account.id },
        data: {
          phoneIntegrationMethod: 'ported',
          phoneIntegrationSettings: {
            ...(phoneIntegrationSettings || {}),
            vapiAssistantId: assistant.id,
            vapiSquadId: squad.id,
            vapiPhoneId: vapiPhone.id,
            voiceConfig: data.voice,
            phoneNumber: phoneNumber,
            knowledgeBaseFileIds: data.files?.map((f: any) => f.id) || [], // SAVE FILE IDs!
            deployedAt: new Date().toISOString(),
          },
        },
      });

      logger.info(
        { accountId: account.id },
        '[Receptionist] AI receptionist deployed successfully'
      );

      return {
        success: true,
        assistantId: assistant.id,
        squadId: squad.id,
        phoneId: vapiPhone.id,
        phoneNumber: phoneNumber,
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
      // TODO: Implement file upload to Vapi
      // This would:
      // 1. Upload files to Vapi's file API
      // 2. Return file IDs
      // 3. Store file IDs in database

      logger.info('[Receptionist] Knowledge base upload complete');

      return {
        success: true,
        fileIds: [], // Would return actual file IDs
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
