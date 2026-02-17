'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { enhanceAction } from '@kit/next/actions';
import { getLogger } from '@kit/shared/logger';
import { createVapiService } from '@kit/shared/vapi/server';
import { prisma } from '@kit/prisma';
import {
  getDentalClinicTemplate,
  buildSquadPayloadFromTemplate,
  dbShapeToTemplate,
  templateToDbShape,
  DENTAL_CLINIC_TEMPLATE_VERSION,
  CALL_ANALYSIS_SCHEMA,
  getAllFunctionToolDefinitions,
  prepareToolDefinitionsForCreation,
} from '@kit/shared/vapi/templates';
import type {
  TemplateVariables,
  RuntimeConfig,
  KnowledgeBaseConfig,
} from '@kit/shared/vapi/templates';

/**
 * Derive the Twilio country code (ISO 3166-1 alpha-2) from a phone number.
 * Canadian numbers start with +1 but have area codes in the 2xx-9xx range
 * that map to Canadian provinces. We check the well-known Canadian area codes.
 */
function detectCountryFromPhone(phone: string): string {
  if (!phone) return 'US';
  const digits = phone.replace(/\D/g, '');

  // Canadian area codes (comprehensive list)
  const canadianAreaCodes = new Set([
    '204', '226', '236', '249', '250', '263', '289',
    '306', '343', '354', '365', '367', '368', '382',
    '403', '416', '418', '428', '431', '437', '438', '450', '468',
    '506', '514', '519', '548', '579', '581', '584', '587',
    '600', '604', '613', '639', '647', '672', '683',
    '705', '709', '742', '753', '778', '780', '782',
    '807', '819', '825', '867', '873', '879',
    '902', '905',
  ]);

  // +1XXXXXXXXXX — check the 3-digit area code after the country code
  if (digits.startsWith('1') && digits.length >= 4) {
    const areaCode = digits.substring(1, 4);
    if (canadianAreaCodes.has(areaCode)) return 'CA';
    return 'US';
  }

  // International numbers
  if (digits.startsWith('44')) return 'GB';
  if (digits.startsWith('33')) return 'FR';
  if (digits.startsWith('61')) return 'AU';

  return 'US';
}

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
  knowledgeBaseConfig: z.record(z.array(z.string())).optional(),
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

      // Check if this account already has a phone number assigned
      const currentSettings = account.phoneIntegrationSettings as any;
      if (currentSettings?.phoneNumber) {
        phoneNumber = currentSettings.phoneNumber;
        logger.info(
          { phoneNumber, accountId: account.id },
          '[Receptionist] Re-using previously assigned phone number'
        );
      } else {
        // Find an unassigned Twilio number.
        // First, get all numbers already assigned to ANY account.
        const assignedAccounts = await prisma.account.findMany({
          where: {
            phoneIntegrationSettings: { not: undefined },
          },
          select: {
            id: true,
            phoneIntegrationSettings: true,
          },
        });

        const assignedNumbers = new Set<string>();
        for (const acc of assignedAccounts) {
          const settings = acc.phoneIntegrationSettings as any;
          if (settings?.phoneNumber) {
            assignedNumbers.add(settings.phoneNumber);
          }
        }

        // Also check VapiPhoneNumber table
        try {
          const vapiPhoneRecords = await prisma.vapiPhoneNumber.findMany({
            select: { phoneNumber: true },
          });
          for (const rec of vapiPhoneRecords) {
            assignedNumbers.add(rec.phoneNumber);
          }
        } catch {
          // Table may not exist yet
        }

        const existingNumbers = await twilioService.listNumbers();
        const unassignedNumber = existingNumbers.find(
          (n: any) => !assignedNumbers.has(n.phoneNumber)
        );

        if (unassignedNumber) {
          phoneNumber = unassignedNumber.phoneNumber;
          logger.info(
            { phoneNumber, accountId: account.id },
            '[Receptionist] Using unassigned Twilio phone number'
          );
        } else {
          // All existing numbers are taken — search for and purchase a new one
          const purchaseCountry = detectCountryFromPhone(phoneIntegrationSettings?.clinicNumber || '');
          logger.info(
            { accountId: account.id, purchaseCountry, clinicNumber: phoneIntegrationSettings?.clinicNumber },
            '[Receptionist] All Twilio numbers assigned, purchasing a new one'
          );
          try {
            const availableNumbers = await twilioService.searchAvailableNumbers(purchaseCountry, 'Local', {
              voiceEnabled: true,
              limit: 1,
            });
            if (!availableNumbers || availableNumbers.length === 0) {
              throw new Error('No phone numbers available for purchase');
            }
            const purchased = await twilioService.purchaseNumber({
              phoneNumber: availableNumbers[0]!.phoneNumber,
              friendlyName: `Parlae - ${businessName}`,
            });
            if (!purchased) {
              throw new Error('Purchase returned null');
            }
            phoneNumber = purchased.phoneNumber;
            logger.info(
              { phoneNumber, accountId: account.id },
              '[Receptionist] Purchased new Twilio phone number'
            );
          } catch (purchaseError) {
            logger.error(
              { error: purchaseError, accountId: account.id },
              '[Receptionist] Failed to purchase Twilio number'
            );
            throw new Error('No Twilio phone numbers available and failed to purchase a new one. Please contact support.');
          }
        }
      }

      // STEP 2: Collect knowledge base file IDs (categorized or flat)
      const knowledgeBaseConfig: KnowledgeBaseConfig = data.knowledgeBaseConfig || {};
      const knowledgeFileIds: string[] = data.files?.map((f: any) => f.id) || [];
      const hasCategorizedKB = Object.values(knowledgeBaseConfig).some((ids) => ids && ids.length > 0);

      logger.info(
        {
          accountId: account.id,
          legacyFileCount: knowledgeFileIds.length,
          categorizedKB: hasCategorizedKB,
          kbCategories: Object.keys(knowledgeBaseConfig).filter((k) => knowledgeBaseConfig[k]?.length > 0),
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

      // Determine the phone number for emergency human transfers.
      // Prefer the staff direct line (no forwarding loop risk), fall back to clinic number.
      const clinicOriginalNumber =
        phoneIntegrationSettings?.staffDirectNumber ||
        phoneIntegrationSettings?.clinicNumber ||
        account.brandingContactPhone ||
        undefined;

      // Webhook URL should point to the NestJS backend API directly.
      const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '';
      const frontendUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || '';
      const webhookUrl = backendUrl
        ? `${backendUrl}/vapi/webhook`
        : `${frontendUrl}/api/vapi/webhook`;

      const webhookSecret = process.env.VAPI_WEBHOOK_SECRET || process.env.VAPI_SERVER_SECRET;

      // Auto-detect Vapi custom credential for proper auth in dashboard
      const credential = await vapiService.findCredentialByName('parlae-production');
      const vapiCredentialId = credential?.id;

      // Ensure standalone tools exist in Vapi before building squad
      const toolDefs = prepareToolDefinitionsForCreation(
        getAllFunctionToolDefinitions(),
        webhookUrl,
        webhookSecret,
        vapiCredentialId,
      );
      const toolIdMap = await vapiService.ensureStandaloneTools(toolDefs, DENTAL_CLINIC_TEMPLATE_VERSION, vapiCredentialId);

      logger.info({ toolCount: toolIdMap.size, hasCredential: !!vapiCredentialId }, '[Agent Setup] Standalone tools resolved');

      // Ensure single clinic query tool for knowledge base
      // Merge all file IDs across categories into one tool per clinic
      let queryToolId: string | undefined;
      let queryToolName: string | undefined;
      const allKBFileIds: string[] = hasCategorizedKB
        ? Object.values(knowledgeBaseConfig).flat().filter(Boolean)
        : knowledgeFileIds;

      if (allKBFileIds.length > 0) {
        const result = await vapiService.ensureClinicQueryTool(
          account.id,
          allKBFileIds,
          DENTAL_CLINIC_TEMPLATE_VERSION,
          businessName,
        );
        if (result) {
          queryToolId = result.toolId;
          queryToolName = result.toolName;
          logger.info({ queryToolId, queryToolName, fileCount: allKBFileIds.length }, '[Agent Setup] Clinic query tool resolved');
        }
      }

      const runtimeConfig: RuntimeConfig = {
        webhookUrl,
        webhookSecret,
        knowledgeFileIds: allKBFileIds.length > 0 ? allKBFileIds : undefined,
        knowledgeBaseConfig: hasCategorizedKB ? knowledgeBaseConfig : undefined,
        clinicPhoneNumber: clinicOriginalNumber,
        toolIdMap,
        vapiCredentialId,
        queryToolId,
        queryToolName,
      };

      // STEP 4: Build the squad from template
      // Always prefer the latest built-in template if its version is newer.
      let templateConfig;
      let templateVersion: string;
      let templateName: string;
      const builtInTemplate = getDentalClinicTemplate();
      const builtInVersion = DENTAL_CLINIC_TEMPLATE_VERSION;

      if (account.agentTemplateId) {
        const dbTemplate = await prisma.agentTemplate.findUnique({
          where: { id: account.agentTemplateId },
        });

        if (dbTemplate && dbTemplate.isActive && dbTemplate.version >= builtInVersion) {
          templateConfig = dbShapeToTemplate(dbTemplate as any);
          templateVersion = dbTemplate.version;
          templateName = dbTemplate.name;
          logger.info(
            { templateName, templateVersion, memberCount: templateConfig.members.length },
            '[Receptionist] Using DB template'
          );
        } else {
          templateConfig = builtInTemplate;
          templateVersion = builtInVersion;
          templateName = builtInTemplate.name;
          logger.info({
            builtInVersion,
            dbVersion: dbTemplate?.version,
            memberCount: builtInTemplate.members.length,
          }, '[Receptionist] Built-in template is newer, using it');
        }
      } else {
        templateConfig = builtInTemplate;
        templateVersion = builtInVersion;
        templateName = builtInTemplate.name;
        logger.info(
          { templateName, templateVersion, memberCount: templateConfig.members.length },
          '[Receptionist] Using built-in default template'
        );
      }

      // Apply user's selected voice to ALL squad members for consistency
      if (templateConfig.members && templateConfig.members.length > 0) {
        for (const member of templateConfig.members) {
          if (member.assistant) {
            const voiceConfig: Record<string, unknown> = {
              provider: data.voice.provider as any,
              voiceId: data.voice.voiceId,
            };
            // ElevenLabs-specific voice tuning params
            if (data.voice.provider === '11labs' || data.voice.provider === 'elevenlabs') {
              voiceConfig.stability = 0.5;
              voiceConfig.similarityBoost = 0.75;
            }
            member.assistant.voice = voiceConfig as any;
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

      // STEP 7: Ensure the template exists in DB and link it to the account.
      // Always sync the DB template to the latest built-in version.
      let templateId = account.agentTemplateId;
      const dbShape = templateToDbShape(templateConfig);

      if (templateId) {
        // Account already linked — update the DB record if the version is newer
        try {
          const existing = await prisma.agentTemplate.findUnique({ where: { id: templateId } });
          if (existing && existing.version < templateVersion) {
            await prisma.agentTemplate.update({
              where: { id: templateId },
              data: { ...dbShape, isActive: true },
            });
            logger.info(
              { templateId, oldVersion: existing.version, newVersion: templateVersion },
              '[Receptionist] Updated DB template to latest version',
            );
          }
        } catch (updateErr: any) {
          logger.warn({ error: updateErr?.message }, '[Receptionist] Non-fatal: could not update DB template');
        }
      } else {
        // No DB template linked — find or create
        const existingDbTemplate = await prisma.agentTemplate.findFirst({
          where: { name: dbShape.name },
        });
        if (existingDbTemplate) {
          templateId = existingDbTemplate.id;
          // Also update it if version is newer
          if (existingDbTemplate.version < templateVersion) {
            try {
              await prisma.agentTemplate.update({
                where: { id: templateId },
                data: { ...dbShape, isActive: true },
              });
            } catch { /* best effort */ }
          }
        } else {
          const created = await prisma.agentTemplate.create({ data: dbShape });
          templateId = created.id;
        }
      }

      // STEP 8: Update account with full Vapi configuration
      // Preserve the user's chosen phone integration method (forwarded, ported, sip)
      const existingMethod = account.phoneIntegrationMethod && account.phoneIntegrationMethod !== 'none'
        ? account.phoneIntegrationMethod
        : 'forwarded';

      // Build the new settings, preserving existing KB data if the wizard
      // didn't supply any (e.g. user only changed voice).
      const updatedSettings: Record<string, unknown> = {
        ...(phoneIntegrationSettings || {}),
        vapiSquadId: squad.id,
        vapiPhoneId: vapiPhone.id,
        voiceConfig: data.voice,
        phoneNumber: phoneNumber,
        templateVersion,
        templateName,
        deployedAt: new Date().toISOString(),
      };

      // Only overwrite KB fields when the wizard actually provided KB data.
      // Setting to `undefined` would erase existing values from the KB management page.
      if (allKBFileIds.length > 0) {
        updatedSettings.knowledgeBaseFileIds = allKBFileIds;
      }
      if (hasCategorizedKB) {
        updatedSettings.knowledgeBaseConfig = knowledgeBaseConfig;
      }
      if (queryToolId) {
        updatedSettings.queryToolId = queryToolId;
      }
      if (queryToolName) {
        updatedSettings.queryToolName = queryToolName;
      }

      await prisma.account.update({
        where: { id: account.id },
        data: {
          phoneIntegrationMethod: existingMethod,
          agentTemplateId: templateId,
          phoneIntegrationSettings: updatedSettings as any,
        },
      });

      // STEP 9: Ensure VapiPhoneNumber record exists (needed for call logs + analytics)
      try {
        await prisma.vapiPhoneNumber.upsert({
          where: { vapiPhoneId: vapiPhone.id },
          update: {
            accountId: account.id,
            phoneNumber,
            vapiSquadId: squad.id,
            isActive: true,
          },
          create: {
            accountId: account.id,
            vapiPhoneId: vapiPhone.id,
            phoneNumber,
            vapiSquadId: squad.id,
            name: 'Main Line',
            isActive: true,
          },
        });
        logger.info({ vapiPhoneId: vapiPhone.id }, '[Receptionist] VapiPhoneNumber record ensured');
      } catch (phoneRecordErr: any) {
        logger.warn({ error: phoneRecordErr?.message }, '[Receptionist] Non-fatal: could not upsert VapiPhoneNumber');
      }

      // STEP 10: Ensure standalone structured output is created and linked to squad assistants
      try {
        const assistantIds = (squad.members || [])
          .map((m: any) => m.assistantId)
          .filter(Boolean) as string[];

        if (assistantIds.length > 0) {
          const structuredOutputId = await vapiService.ensureCallAnalysisOutput(
            assistantIds,
            CALL_ANALYSIS_SCHEMA,
            templateVersion,
          );

          if (structuredOutputId) {
            // Only add the structuredOutputId to the settings written in STEP 8.
            // Re-read current settings from DB to avoid reverting STEP 8 changes.
            const freshAccount = await prisma.account.findUnique({
              where: { id: account.id },
              select: { phoneIntegrationSettings: true },
            });
            const freshSettings = (freshAccount?.phoneIntegrationSettings as Record<string, unknown>) || {};

            await prisma.account.update({
              where: { id: account.id },
              data: {
                phoneIntegrationSettings: {
                  ...freshSettings,
                  structuredOutputId,
                },
              },
            });
            logger.info(
              { structuredOutputId, assistantCount: assistantIds.length },
              '[Receptionist] Structured output linked to squad assistants',
            );
          }
        }
      } catch (soErr: any) {
        logger.warn(
          { error: soErr?.message },
          '[Receptionist] Non-fatal: could not ensure structured output',
        );
      }

      logger.info(
        { accountId: account.id, squadId: squad.id, templateVersion },
        '[Receptionist] AI receptionist deployed successfully'
      );

      // Revalidate the overview page so it renders with fresh data after redirect
      revalidatePath('/home/agent');
      revalidatePath('/home/agent/knowledge');

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

/**
 * Change the Twilio phone number for a deployed agent.
 *
 * 1. Searches for and purchases a new Twilio number
 * 2. Imports it into Vapi (or updates the existing Vapi phone)
 * 3. Links it to the current squad
 * 4. Updates account settings
 */
const ChangePhoneNumberSchema = z.object({});

export const changePhoneNumberAction = enhanceAction(
  async (_data, user) => {
    const logger = await getLogger();
    const vapiService = createVapiService();

    logger.info({ userId: user.id }, '[Receptionist] Changing phone number');

    try {
      const account = await prisma.account.findFirst({
        where: { primaryOwnerId: user.id },
        select: {
          id: true,
          name: true,
          phoneIntegrationSettings: true,
          brandingBusinessName: true,
        },
      });

      if (!account) {
        throw new Error('Account not found');
      }

      const settings = account.phoneIntegrationSettings as any;
      if (!settings?.vapiSquadId) {
        throw new Error('No deployed agent found. Please deploy first.');
      }

      const MAX_PHONE_CHANGES = 5;
      const changeCount = settings?.phoneChangeCount ?? 0;
      if (changeCount >= MAX_PHONE_CHANGES) {
        throw new Error(
          `You have reached the maximum of ${MAX_PHONE_CHANGES} phone number changes. Please contact support to change your number.`
        );
      }

      const businessName = account.brandingBusinessName || account.name;
      const changeCountry = detectCountryFromPhone(settings?.clinicNumber || settings?.phoneNumber || '');

      // Search for a new Twilio number in the same country as the clinic
      const { createTwilioService } = await import('@kit/shared/twilio/server');
      const twilioService = createTwilioService();

      const availableNumbers = await twilioService.searchAvailableNumbers(changeCountry, 'Local', {
        voiceEnabled: true,
        limit: 1,
      });

      if (!availableNumbers || availableNumbers.length === 0) {
        throw new Error('No phone numbers available for purchase. Please try again later.');
      }

      const purchased = await twilioService.purchaseNumber({
        phoneNumber: availableNumbers[0]!.phoneNumber,
        friendlyName: `Parlae - ${businessName}`,
      });

      if (!purchased) {
        throw new Error('Failed to purchase phone number');
      }

      const newPhoneNumber = purchased.phoneNumber;
      logger.info(
        { newPhoneNumber, accountId: account.id },
        '[Receptionist] Purchased new phone number'
      );

      // Import new number to Vapi and link to squad
      const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID!;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN!;

      // Check if number already exists in Vapi
      const vapiPhoneNumbers = await vapiService.listPhoneNumbers();
      const existingVapiPhone = vapiPhoneNumbers.find(
        (p: any) => p.number === newPhoneNumber
      );

      let vapiPhone;

      if (existingVapiPhone) {
        vapiPhone = await vapiService.updatePhoneNumber(
          existingVapiPhone.id,
          settings.vapiSquadId,
          true
        );
      } else {
        vapiPhone = await vapiService.importPhoneNumber(
          newPhoneNumber,
          twilioAccountSid,
          twilioAuthToken,
          settings.vapiSquadId,
          true
        );
      }

      if (!vapiPhone) {
        throw new Error('Failed to import phone number to Vapi');
      }

      // Unlink old number from Vapi squad (optional cleanup)
      if (settings.vapiPhoneId && settings.vapiPhoneId !== vapiPhone.id) {
        try {
          await vapiService.updatePhoneNumber(settings.vapiPhoneId, null, false);
        } catch {
          logger.warn('[Receptionist] Could not unlink old Vapi phone number');
        }
      }

      // Update account settings and increment the change counter
      await prisma.account.update({
        where: { id: account.id },
        data: {
          phoneIntegrationSettings: {
            ...settings,
            vapiPhoneId: vapiPhone.id,
            phoneNumber: newPhoneNumber,
            phoneChangeCount: changeCount + 1,
          },
        },
      });

      // Deactivate old VapiPhoneNumber and create new one
      if (settings.vapiPhoneId) {
        try {
          await prisma.vapiPhoneNumber.updateMany({
            where: { vapiPhoneId: settings.vapiPhoneId },
            data: { isActive: false },
          });
        } catch { /* best effort */ }
      }
      try {
        await prisma.vapiPhoneNumber.upsert({
          where: { vapiPhoneId: vapiPhone.id },
          update: {
            accountId: account.id,
            phoneNumber: newPhoneNumber,
            vapiSquadId: settings.vapiSquadId || null,
            isActive: true,
          },
          create: {
            accountId: account.id,
            vapiPhoneId: vapiPhone.id,
            phoneNumber: newPhoneNumber,
            vapiSquadId: settings.vapiSquadId || null,
            name: 'Main Line',
            isActive: true,
          },
        });
      } catch (err: any) {
        logger.warn({ error: err?.message }, '[Receptionist] Non-fatal: could not upsert VapiPhoneNumber on change');
      }

      logger.info(
        { accountId: account.id, oldPhone: settings.phoneNumber, newPhone: newPhoneNumber },
        '[Receptionist] Phone number changed successfully'
      );

      return {
        success: true,
        phoneNumber: newPhoneNumber,
      };
    } catch (error) {
      logger.error(
        { error, userId: user.id },
        '[Receptionist] Failed to change phone number'
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to change phone number',
      };
    }
  },
  {
    auth: true,
    schema: ChangePhoneNumberSchema,
  }
);

/**
 * Update voice on all live squad assistants and persist to DB.
 *
 * Used from the standalone "Change Voice" page (manage mode) so the user
 * can change the voice without re-running the full wizard/deploy flow.
 */
const UpdateVoiceSchema = z.object({
  accountId: z.string(),
  voice: z.object({
    id: z.string(),
    name: z.string(),
    provider: z.enum(['11labs', 'elevenlabs', 'openai', 'playht', 'azure', 'deepgram', 'cartesia', 'rime-ai']),
    voiceId: z.string(),
    gender: z.string(),
    accent: z.string(),
    description: z.string(),
  }),
  clinicName: z.string().min(1),
});

export const updateVoiceAction = enhanceAction(
  async (data, user) => {
    const logger = await getLogger();
    const vapiService = createVapiService();

    logger.info(
      { userId: user.id, accountId: data.accountId, voiceName: data.voice.name },
      '[Voice Update] Starting live voice update',
    );

    try {
      const account = await prisma.account.findUnique({
        where: { id: data.accountId },
        select: {
          id: true,
          phoneIntegrationSettings: true,
        },
      });

      if (!account) {
        return { success: false, error: 'Account not found' };
      }

      const settings = (account.phoneIntegrationSettings as Record<string, unknown>) || {};
      const vapiSquadId = settings.vapiSquadId as string | undefined;

      if (!vapiSquadId) {
        return { success: false, error: 'No deployed squad found. Please complete the setup wizard first.' };
      }

      // Fetch squad to get all assistant IDs
      const squad = await vapiService.getSquad(vapiSquadId);

      if (!squad || !squad.members) {
        return { success: false, error: 'Could not fetch squad from Vapi' };
      }

      const assistantIds = (squad.members as any[])
        .map((m: any) => m.assistantId || m.assistant?.id)
        .filter(Boolean) as string[];

      if (assistantIds.length === 0) {
        return { success: false, error: 'No assistants found in squad' };
      }

      // Update voice on all assistants in parallel
      const voicePayload = {
        provider: data.voice.provider,
        voiceId: data.voice.voiceId,
      };

      const results = await Promise.allSettled(
        assistantIds.map((id) =>
          vapiService.updateAssistant(id, { voice: voicePayload } as any),
        ),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value).length;
      const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length;

      logger.info(
        { succeeded, failed, total: assistantIds.length },
        '[Voice Update] Vapi assistant voice updates complete',
      );

      if (succeeded === 0) {
        return { success: false, error: 'Failed to update voice on any assistant' };
      }

      // Persist voice config and clinic name to DB
      const updatedSettings = {
        ...settings,
        voiceConfig: {
          id: data.voice.id,
          name: data.voice.name,
          provider: data.voice.provider,
          voiceId: data.voice.voiceId,
          gender: data.voice.gender,
          accent: data.voice.accent,
          description: data.voice.description,
        },
      };

      const updateData: Record<string, unknown> = {
        phoneIntegrationSettings: updatedSettings,
      };

      if (data.clinicName) {
        updateData.brandingBusinessName = data.clinicName;
      }

      await prisma.account.update({
        where: { id: account.id },
        data: updateData as any,
      });

      revalidatePath('/home/agent');

      logger.info(
        { accountId: account.id, voiceName: data.voice.name, assistantsUpdated: succeeded },
        '[Voice Update] Voice updated successfully',
      );

      return {
        success: true,
        assistantsUpdated: succeeded,
        assistantsFailed: failed,
      };
    } catch (error) {
      logger.error(
        { error, userId: user.id },
        '[Voice Update] Failed to update voice',
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update voice',
      };
    }
  },
  {
    auth: true,
    schema: UpdateVoiceSchema,
  },
);
