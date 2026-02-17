import { NextResponse } from 'next/server';
import { createVapiService } from '@kit/shared/vapi/server';
import { createTwilioService } from '@kit/shared/twilio/server';
import { getLogger } from '@kit/shared/logger';
import { prisma } from '@kit/prisma';
import {
  getDentalClinicTemplate,
  buildSquadPayloadFromTemplate,
  dbShapeToTemplate,
  DENTAL_CLINIC_TEMPLATE_VERSION,
  CALL_ANALYSIS_SCHEMA,
  getAllFunctionToolDefinitions,
  prepareToolDefinitionsForCreation,
} from '@kit/shared/vapi/templates';
import type {
  TemplateVariables,
  RuntimeConfig,
} from '@kit/shared/vapi/templates';

/**
 * POST /api/agent/setup-squad
 * 
 * Create a multi-assistant Squad for complex workflows.
 * 
 * Supports template-based creation:
 * - If `templateId` is provided, the squad config is loaded from the DB template.
 * - Otherwise, the built-in default template is used.
 * - If `accountId` is provided, the template version is recorded on the account.
 * 
 * Body:
 * {
 *   customerName: string
 *   squadType: 'dental-clinic' | 'sales' | 'support'
 *   templateId?: string          // Optional: DB template ID to use
 *   accountId?: string           // Optional: Account to link template version to
 *   phoneNumber?: string         // Or will purchase new
 *   areaCode?: string
 *   twilioSubAccountSid?: string
 *   businessInfo: {
 *     services?: string[] | string
 *     hours?: string
 *     location?: string
 *     insurance?: string
 *     pricing?: string
 *     policies?: string
 *   }
 * }
 */
export async function POST(request: Request) {
  const logger = await getLogger();

  try {
    const body = await request.json();
    const {
      customerName,
      customerEmail,
      squadType,
      templateId,
      accountId,
      phoneNumber: existingPhoneNumber,
      areaCode,
      twilioSubAccountSid,
      businessInfo,
    } = body;

    logger.info({
      customerName,
      squadType,
      templateId: templateId ?? 'built-in',
    }, '[Squad Setup] Starting squad setup');

    const vapiService = createVapiService();
    const twilioService = createTwilioService();

    if (!vapiService.isEnabled()) {
      return NextResponse.json(
        { success: false, message: 'Vapi integration not configured' },
        { status: 500 }
      );
    }

    // STEP 1: Get or purchase phone number
    let phoneNumber = existingPhoneNumber;
    let purchasedNumber;

    if (!phoneNumber && twilioService.isEnabled()) {
      logger.info({ areaCode }, '[Squad Setup] Purchasing phone number');
      
      const availableNumbers = await twilioService.searchAvailableNumbers(
        'US',
        'Local',
        { areaCode, smsEnabled: true, voiceEnabled: true, limit: 1 }
      );

      if (availableNumbers.length === 0) {
        return NextResponse.json(
          { success: false, message: 'No available phone numbers found' },
          { status: 500 }
        );
      }

      purchasedNumber = await twilioService.purchaseNumber(
        {
          phoneNumber: availableNumbers[0].phoneNumber,
          friendlyName: `${customerName} - Squad`,
        },
        twilioSubAccountSid
      );

      if (!purchasedNumber) {
        return NextResponse.json(
          { success: false, message: 'Failed to purchase phone number' },
          { status: 500 }
        );
      }

      phoneNumber = purchasedNumber.phoneNumber;
    }

    // STEP 2: Create knowledge base if needed
    let knowledgeFileIds: string[] = [];
    
    if (businessInfo) {
      const knowledgeContent = buildKnowledgeBase(businessInfo);
      const fileId = await vapiService.uploadKnowledgeFile({
        name: `${customerName} - Knowledge Base`,
        content: knowledgeContent,
        type: 'text',
      });

      if (fileId) {
        knowledgeFileIds.push(fileId);
      }
    }

    // STEP 3: Resolve template variables & runtime config
    const templateVars: TemplateVariables = {
      clinicName: customerName,
      clinicHours: businessInfo?.hours,
      clinicLocation: businessInfo?.location,
      clinicInsurance: businessInfo?.insurance,
      clinicServices: Array.isArray(businessInfo?.services)
        ? businessInfo.services.join(', ')
        : businessInfo?.services,
    };

    // Webhook URL should point to the NestJS backend API, not the Next.js frontend.
    // Backend handles both tool calls and lifecycle events (end-of-call-report).
    // In production: https://api.parlae.ca/vapi/webhook
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';
    const frontendUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || '';
    const webhookUrl = backendUrl
      ? `${backendUrl}/vapi/webhook`
      : `${frontendUrl}/api/vapi/webhook`;

    const webhookSecret = process.env.VAPI_WEBHOOK_SECRET || process.env.VAPI_SERVER_SECRET;

    // Auto-detect Vapi custom credential for proper auth in dashboard
    const credential = await vapiService.findCredentialByName('parlae-production');
    const vapiCredentialId = credential?.id;

    // STEP 3b: Ensure standalone tools exist in Vapi
    // Tools are created once and reused across all squads/assistants.
    const toolDefs = prepareToolDefinitionsForCreation(
      getAllFunctionToolDefinitions(),
      webhookUrl,
      webhookSecret,
      vapiCredentialId,
    );
    const toolIdMap = await vapiService.ensureStandaloneTools(
      toolDefs,
      'v1.0',
      vapiCredentialId,
    );

    logger.info({
      toolCount: toolIdMap.size,
      hasCredential: !!vapiCredentialId,
    }, '[Squad Setup] Standalone tools resolved');

    const runtimeConfig: RuntimeConfig = {
      webhookUrl,
      webhookSecret,
      knowledgeFileIds,
      toolIdMap,
      vapiCredentialId,
    };

    // STEP 4: Create squad based on type
    let squad;
    let usedTemplateVersion: string | undefined;
    let usedTemplateName: string | undefined;

    switch (squadType) {
      case 'dental-clinic':
        {
          const { squadPayload, templateVersion, templateName } =
            await resolveDentalClinicSquad(templateId, templateVars, runtimeConfig, logger);
          squad = await vapiService.createSquad(squadPayload);
          usedTemplateVersion = templateVersion;
          usedTemplateName = templateName;
        }
        break;

      case 'sales':
        squad = await createSalesSquad(
          vapiService,
          customerName,
          knowledgeFileIds,
          businessInfo
        );
        break;

      case 'support':
        squad = await createSupportSquad(
          vapiService,
          customerName,
          knowledgeFileIds,
          businessInfo
        );
        break;

      default:
        return NextResponse.json(
          { success: false, message: 'Invalid squad type' },
          { status: 400 }
        );
    }

    if (!squad) {
      // Cleanup: Release phone number if purchased
      if (purchasedNumber) {
        await twilioService.releaseNumber(purchasedNumber.sid, twilioSubAccountSid);
      }
      
      return NextResponse.json(
        { success: false, message: 'Failed to create squad' },
        { status: 500 }
      );
    }

    // STEP 5: Link phone number to squad
    if (phoneNumber && twilioService.isEnabled()) {
      const twilioAccountSid = twilioSubAccountSid || process.env.TWILIO_ACCOUNT_SID || '';
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';

      const vapiPhoneNumber = await vapiService.importPhoneNumber(
        phoneNumber,
        twilioAccountSid,
        twilioAuthToken
      );

      if (!vapiPhoneNumber) {
        logger.warn('[Squad Setup] Failed to import phone number to Vapi');
      }
    }

    // STEP 6: Ensure structured output is created and linked to squad assistants
    let structuredOutputId: string | null = null;
    try {
      const assistantIds = (squad.members || [])
        .map((m: any) => m.assistantId)
        .filter(Boolean) as string[];

      if (assistantIds.length > 0 && usedTemplateVersion) {
        structuredOutputId = await vapiService.ensureCallAnalysisOutput(
          assistantIds,
          CALL_ANALYSIS_SCHEMA,
          usedTemplateVersion,
        );

        if (structuredOutputId) {
          logger.info(
            { structuredOutputId, assistantCount: assistantIds.length },
            '[Squad Setup] Structured output linked to squad assistants',
          );
        }
      }
    } catch (soErr: any) {
      logger.warn(
        { error: soErr?.message },
        '[Squad Setup] Non-fatal: could not ensure structured output',
      );
    }

    // STEP 7: Record template version on account (if accountId provided)
    if (accountId && usedTemplateVersion) {
      try {
        const existingAccount = await prisma.account.findUnique({
          where: { id: accountId },
          select: { phoneIntegrationSettings: true },
        });

        const existingSettings = (existingAccount?.phoneIntegrationSettings as any) ?? {};

        await prisma.account.update({
          where: { id: accountId },
          data: {
            ...(templateId ? { agentTemplateId: templateId } : {}),
            phoneIntegrationSettings: {
              ...existingSettings,
              vapiSquadId: squad.id,
              templateVersion: usedTemplateVersion,
              templateName: usedTemplateName,
              ...(structuredOutputId ? { structuredOutputId } : {}),
              lastTemplateUpdate: new Date().toISOString(),
            },
          },
        });

        logger.info({
          accountId,
          templateVersion: usedTemplateVersion,
          templateName: usedTemplateName,
          structuredOutputId,
        }, '[Squad Setup] Template version recorded on account');
      } catch (dbError) {
        logger.error({ dbError, accountId }, '[Squad Setup] Failed to record template on account');
        // Non-fatal: squad was created, just the DB link failed
      }
    }

    logger.info({
      squadId: squad.id,
      squadName: squad.name,
      phoneNumber,
      templateVersion: usedTemplateVersion,
      structuredOutputId,
    }, '[Squad Setup] Squad created successfully');

    return NextResponse.json({
      success: true,
      squad: {
        id: squad.id,
        name: squad.name,
        type: squadType,
        phoneNumber,
        members: squad.members?.length || 0,
      },
      template: {
        version: usedTemplateVersion,
        name: usedTemplateName,
        source: templateId ? 'database' : 'built-in',
      },
      message: 'Squad created successfully',
    });

  } catch (error) {
    const logger = await getLogger();
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[Squad Setup] Exception during setup');

    return NextResponse.json(
      { success: false, message: 'Failed to setup squad' },
      { status: 500 }
    );
  }
}

/**
 * Resolve the dental clinic squad config from a DB template or the built-in default.
 *
 * Returns the Vapi-ready squad payload and template metadata.
 */
async function resolveDentalClinicSquad(
  templateId: string | undefined,
  variables: TemplateVariables,
  runtime: RuntimeConfig,
  logger: any,
): Promise<{
  squadPayload: Record<string, unknown>;
  templateVersion: string;
  templateName: string;
}> {
  let templateConfig;
  let templateVersion: string;
  let templateName: string;

  const builtInTemplate = getDentalClinicTemplate();
  const builtInVersion = DENTAL_CLINIC_TEMPLATE_VERSION;

  if (templateId) {
    // ── Load template from database ──────────────────────────────────────
    logger.info({ templateId }, '[Squad Setup] Loading template from database');

    const dbTemplate = await prisma.agentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!dbTemplate) {
      throw new Error(`Template ${templateId} not found`);
    }

    if (!dbTemplate.isActive) {
      throw new Error(`Template ${templateId} is not active`);
    }

    // Prefer built-in if it has a newer version
    if (dbTemplate.version >= builtInVersion) {
      templateConfig = dbShapeToTemplate(dbTemplate as any);
      templateVersion = dbTemplate.version;
      templateName = dbTemplate.name;

      logger.info({
        templateName,
        templateVersion,
        memberCount: templateConfig.members.length,
      }, '[Squad Setup] Using DB template');
    } else {
      templateConfig = builtInTemplate;
      templateVersion = builtInVersion;
      templateName = builtInTemplate.name;

      logger.info({
        builtInVersion,
        dbVersion: dbTemplate.version,
        memberCount: builtInTemplate.members.length,
      }, '[Squad Setup] Built-in template is newer, using it');
    }
  } else {
    // ── Use built-in default template ────────────────────────────────────
    templateConfig = builtInTemplate;
    templateVersion = builtInVersion;
    templateName = builtInTemplate.name;

    logger.info({
      templateName,
      templateVersion,
      memberCount: builtInTemplate.members.length,
    }, '[Squad Setup] Using built-in default template');
  }

  const squadPayload = buildSquadPayloadFromTemplate(
    templateConfig,
    variables,
    runtime,
  );

  return { squadPayload, templateVersion, templateName };
}

/**
 * Create a sales qualification and demo squad
 */
async function createSalesSquad(
  vapiService: any,
  customerName: string,
  knowledgeFileIds: string[],
  businessInfo: any
) {
  // TODO: Implement sales squad (Qualifier → Demo Scheduler → Account Manager)
  return null;
}

/**
 * Create a support triage squad
 */
async function createSupportSquad(
  vapiService: any,
  customerName: string,
  knowledgeFileIds: string[],
  businessInfo: any
) {
  // TODO: Implement support squad (L1 → L2 → Engineering)
  return null;
}

/**
 * Build knowledge base content from business info
 */
function buildKnowledgeBase(businessInfo: any): string {
  let kb = '';

  if (businessInfo.services && Array.isArray(businessInfo.services)) {
    kb += `Services We Offer:\n`;
    businessInfo.services.forEach((service: string) => {
      kb += `- ${service}\n`;
    });
    kb += '\n';
  }

  if (businessInfo.hours) {
    kb += `Business Hours: ${businessInfo.hours}\n\n`;
  }

  if (businessInfo.location) {
    kb += `Location: ${businessInfo.location}\n\n`;
  }

  if (businessInfo.insurance) {
    kb += `Insurance: ${businessInfo.insurance}\n\n`;
  }

  if (businessInfo.pricing) {
    kb += `Pricing Information:\n${businessInfo.pricing}\n\n`;
  }

  if (businessInfo.policies) {
    kb += `Policies:\n${businessInfo.policies}\n\n`;
  }

  return kb;
}
