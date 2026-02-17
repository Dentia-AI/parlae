import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';
import { createVapiService } from '@kit/shared/vapi/server';
import { getLogger } from '@kit/shared/logger';
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
} from '@kit/shared/vapi/templates';

/**
 * POST /api/admin/redeploy-squad
 *
 * Admin-only endpoint to re-create the Vapi squad for an account that was
 * deployed with a broken/basic configuration. This does NOT charge the user.
 *
 * Body:
 * {
 *   accountId: string          // The account to re-deploy
 *   deleteOldSquad?: boolean   // Whether to delete the old squad from Vapi (default: true)
 * }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const body = await request.json();
    const { accountId, deleteOldSquad = true, phoneIntegrationMethod: methodOverride } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
      id: true,
      name: true,
      email: true,
      phoneIntegrationMethod: true,
      phoneIntegrationSettings: true,
      agentTemplateId: true,
        brandingBusinessName: true,
        brandingContactPhone: true,
        setupProgress: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 },
      );
    }

    const vapiService = createVapiService();
    const phoneIntegrationSettings = (account.phoneIntegrationSettings as any) ?? {};
    const businessName =
      account.brandingBusinessName ||
      phoneIntegrationSettings.businessName ||
      account.name;
    const setupProgress = (account.setupProgress as Record<string, any>) ?? {};

    logger.info(
      { accountId, businessName },
      '[Admin Redeploy] Starting squad re-deployment',
    );

    // STEP 1: Collect knowledge base file IDs from existing deployment
    const knowledgeFileIds: string[] =
      phoneIntegrationSettings.knowledgeBaseFileIds || [];

    // STEP 2: Resolve template variables
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
      phoneIntegrationSettings.staffDirectNumber ||
      phoneIntegrationSettings.clinicNumber ||
      account.brandingContactPhone ||
      undefined;

    logger.info(
      { clinicOriginalNumber, staffDirect: phoneIntegrationSettings.staffDirectNumber, clinicNum: phoneIntegrationSettings.clinicNumber, brandingPhone: account.brandingContactPhone },
      '[Admin Redeploy] Resolved clinic phone for emergency transfers',
    );

    // Webhook URL should point to the NestJS backend API directly.
    // In production: https://api.parlae.ca/vapi/webhook
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '';
    const frontendUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || '';
    const webhookUrl = backendUrl
      ? `${backendUrl}/vapi/webhook`
      : `${frontendUrl}/api/vapi/webhook`;

    const webhookSecret = process.env.VAPI_WEBHOOK_SECRET || process.env.VAPI_SERVER_SECRET;

    // Auto-detect Vapi custom credential for proper authentication display in dashboard
    const credential = await vapiService.findCredentialByName('parlae-production');
    const vapiCredentialId = credential?.id;

    logger.info({ hasCredential: !!vapiCredentialId, credentialName: credential?.name }, '[Admin Redeploy] Vapi credential lookup');

    // Ensure standalone tools exist in Vapi (creates if missing, reuses if found)
    const toolDefs = prepareToolDefinitionsForCreation(
      getAllFunctionToolDefinitions(),
      webhookUrl,
      webhookSecret,
      vapiCredentialId,
    );
    const toolIdMap = await vapiService.ensureStandaloneTools(toolDefs, DENTAL_CLINIC_TEMPLATE_VERSION, vapiCredentialId);

    logger.info({ toolCount: toolIdMap.size }, '[Admin Redeploy] Standalone tools resolved');

    // Ensure single clinic query tool for knowledge base
    const storedKBConfig = phoneIntegrationSettings?.knowledgeBaseConfig as Record<string, string[]> | undefined;
    const allKBFileIds: string[] = storedKBConfig
      ? Object.values(storedKBConfig).flat().filter(Boolean)
      : knowledgeFileIds;

    let queryToolId: string | undefined;
    let queryToolName: string | undefined;
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
        logger.info({ queryToolId, queryToolName, fileCount: allKBFileIds.length }, '[Admin Redeploy] Clinic query tool resolved');
      }
    }

    const runtimeConfig: RuntimeConfig = {
      webhookUrl,
      webhookSecret,
      knowledgeFileIds: allKBFileIds.length > 0 ? allKBFileIds : undefined,
      knowledgeBaseConfig: storedKBConfig || undefined,
      clinicPhoneNumber: clinicOriginalNumber,
      toolIdMap,
      vapiCredentialId,
      queryToolId,
      queryToolName,
      accountId: account.id,
    };

    // STEP 4: Load template
    //
    // Always prefer the latest built-in template if its version is newer
    // than the DB template. Admin "recreate" should deploy the latest config.
    let templateConfig;
    let templateVersion: string;
    let templateName: string;
    const builtInTemplate = getDentalClinicTemplate();
    const builtInVersion = DENTAL_CLINIC_TEMPLATE_VERSION;

    if (account.agentTemplateId) {
      const dbTemplate = await prisma.agentTemplate.findUnique({
        where: { id: account.agentTemplateId },
      });

      if (dbTemplate && dbTemplate.isActive && dbTemplate.version > builtInVersion) {
        // DB template is strictly newer (custom/hotfix) — use it
        templateConfig = dbShapeToTemplate(dbTemplate as any);
        templateVersion = dbTemplate.version;
        templateName = dbTemplate.name;
        logger.info({ templateVersion, templateName, builtInVersion, memberCount: templateConfig.members.length }, '[Admin Redeploy] Using DB template (strictly newer than built-in)');
      } else {
        // Built-in template is same or newer — code is source of truth
        templateConfig = builtInTemplate;
        templateVersion = builtInVersion;
        templateName = builtInTemplate.name;
        logger.info({
          builtInVersion,
          dbVersion: dbTemplate?.version,
          builtInMembers: builtInTemplate.members.length,
          reason: !dbTemplate ? 'no-db-template' : !dbTemplate.isActive ? 'db-inactive' : 'built-in-wins',
        }, '[Admin Redeploy] Using built-in template (code is source of truth)');
      }
    } else {
      templateConfig = builtInTemplate;
      templateVersion = builtInVersion;
      templateName = builtInTemplate.name;
      logger.info({ templateVersion, memberCount: templateConfig.members.length }, '[Admin Redeploy] No DB template, using built-in');
    }

    // STEP 5: Apply voice from existing deployment (if any)
    const voiceConfig = phoneIntegrationSettings.voiceConfig;
    if (voiceConfig && templateConfig.members) {
      for (const member of templateConfig.members) {
        if (member.assistant) {
          const vc: Record<string, unknown> = {
            provider: voiceConfig.provider as any,
            voiceId: voiceConfig.voiceId,
          };
          if (voiceConfig.provider === '11labs' || voiceConfig.provider === 'elevenlabs') {
            vc.stability = 0.5;
            vc.similarityBoost = 0.75;
          }
          member.assistant.voice = vc as any;
        }
      }

      const triageMember = templateConfig.members[0];
      if (triageMember?.assistant) {
        triageMember.assistant.firstMessage =
          `Thank you for calling ${businessName}! I'm ${voiceConfig.name || 'Nova'}. How can I help you today?`;
      }
    }

    // STEP 6: Build and create the NEW squad FIRST (swap pattern).
    // The old squad is only deleted AFTER the new squad is confirmed created,
    // preventing orphaned accounts when creation fails.
    const squadPayload = buildSquadPayloadFromTemplate(
      templateConfig,
      templateVars,
      runtimeConfig,
    );
    (squadPayload as any).name = `${businessName} Squad`;

    const squad = await vapiService.createSquad(squadPayload as any);

    if (!squad) {
      return NextResponse.json(
        { error: 'Failed to create Vapi squad — old squad was NOT deleted' },
        { status: 500 },
      );
    }

    logger.info(
      { squadId: squad.id, memberCount: squad.members?.length },
      '[Admin Redeploy] Created new squad',
    );

    // STEP 6b: Delete old squad now that the new one is confirmed
    const oldSquadId = phoneIntegrationSettings.vapiSquadId;
    if (deleteOldSquad && oldSquadId && oldSquadId !== squad.id) {
      try {
        await vapiService.deleteSquad(oldSquadId);
        logger.info({ oldSquadId }, '[Admin Redeploy] Deleted old squad');
      } catch (err: any) {
        logger.warn(
          { oldSquadId, error: err?.message },
          '[Admin Redeploy] Failed to delete old squad (may not exist)',
        );
      }
    }

    // STEP 7: Update phone number to point to new squad
    const phoneNumber = phoneIntegrationSettings.phoneNumber;
    if (phoneNumber) {
      const vapiPhoneNumbers = await vapiService.listPhoneNumbers();
      const existingVapiPhone = vapiPhoneNumbers.find(
        (p: any) => p.number === phoneNumber,
      );

      if (existingVapiPhone) {
        await vapiService.updatePhoneNumber(
          existingVapiPhone.id,
          squad.id,
          true,
        );
        logger.info(
          { phoneNumberId: existingVapiPhone.id },
          '[Admin Redeploy] Updated phone to new squad',
        );
      }
    }

    // STEP 8: Ensure the template exists in DB and link it to the account.
    //
    // If the built-in template was used (newer version), update or create
    // the DB template so future deploys use the latest configuration.
    let templateId = account.agentTemplateId;
    const dbShape = templateToDbShape(templateConfig);

    if (templateId) {
      // Account already linked to a DB template — update it if we used the built-in
      try {
        const existing = await prisma.agentTemplate.findUnique({ where: { id: templateId } });
        if (existing && existing.version <= templateVersion) {
          await prisma.agentTemplate.update({
            where: { id: templateId },
            data: {
              ...dbShape,
              isActive: true,
            },
          });
          logger.info(
            { templateId, oldVersion: existing.version, newVersion: templateVersion },
            '[Admin Redeploy] Synced DB template with built-in',
          );
        }
      } catch (updateErr: any) {
        logger.warn({ error: updateErr?.message }, '[Admin Redeploy] Non-fatal: could not update DB template');
      }
    } else {
      // No DB template linked — upsert the built-in template
      const existingTemplate = await prisma.agentTemplate.findFirst({
        where: { name: dbShape.name },
      });

      if (existingTemplate) {
        templateId = existingTemplate.id;
        // Also update it if version is same or older (keep DB in sync)
        if (existingTemplate.version <= templateVersion) {
          try {
            await prisma.agentTemplate.update({
              where: { id: templateId },
              data: { ...dbShape, isActive: true },
            });
          } catch { /* best effort */ }
        }
      } else {
        const created = await prisma.agentTemplate.create({
          data: dbShape,
        });
        templateId = created.id;
        logger.info(
          { templateId, name: dbShape.name },
          '[Admin Redeploy] Created built-in template in DB',
        );
      }
    }

    // STEP 9: Update account DB
    // Determine the correct phoneIntegrationMethod — prefer override, then infer from settings
    const resolvedMethod =
      methodOverride ||
      (phoneIntegrationSettings.clinicNumber ? 'forwarded' : account.phoneIntegrationMethod) ||
      account.phoneIntegrationMethod;

    await prisma.account.update({
      where: { id: account.id },
      data: {
        phoneIntegrationMethod: resolvedMethod,
        agentTemplateId: templateId,
        phoneIntegrationSettings: {
          ...phoneIntegrationSettings,
          vapiSquadId: squad.id,
          queryToolId,
          queryToolName,
          templateVersion,
          templateName,
          lastRedeployedAt: new Date().toISOString(),
        },
      },
    });

    // STEP 10: Ensure VapiPhoneNumber record exists (needed for call logs + analytics)
    if (phoneNumber) {
      try {
        const vapiPhoneNumbers2 = await vapiService.listPhoneNumbers();
        const matchedPhone = vapiPhoneNumbers2.find((p: any) => p.number === phoneNumber);
        if (matchedPhone) {
          await prisma.vapiPhoneNumber.upsert({
            where: { vapiPhoneId: matchedPhone.id },
            update: {
              accountId: account.id,
              phoneNumber,
              vapiSquadId: squad.id,
              isActive: true,
            },
            create: {
              accountId: account.id,
              vapiPhoneId: matchedPhone.id,
              phoneNumber,
              vapiSquadId: squad.id,
              name: 'Main Line',
              isActive: true,
            },
          });
          logger.info({ vapiPhoneId: matchedPhone.id }, '[Admin Redeploy] VapiPhoneNumber record ensured');
        }
      } catch (phoneRecordErr: any) {
        logger.warn({ error: phoneRecordErr?.message }, '[Admin Redeploy] Non-fatal: could not upsert VapiPhoneNumber');
      }
    }

    // STEP 11: Ensure standalone structured output is created and linked to squad assistants
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
          await prisma.account.update({
            where: { id: account.id },
            data: {
              phoneIntegrationSettings: {
                ...phoneIntegrationSettings,
                vapiSquadId: squad.id,
                queryToolId,
                queryToolName,
                templateVersion,
                templateName,
                structuredOutputId,
                lastRedeployedAt: new Date().toISOString(),
              },
            },
          });
          logger.info(
            { structuredOutputId, assistantCount: assistantIds.length },
            '[Admin Redeploy] Structured output linked to squad assistants',
          );
        }
      }
    } catch (soErr: any) {
      logger.warn(
        { error: soErr?.message },
        '[Admin Redeploy] Non-fatal: could not ensure structured output',
      );
    }

    logger.info(
      { accountId, squadId: squad.id, templateVersion },
      '[Admin Redeploy] Squad re-deployed successfully',
    );

    return NextResponse.json({
      success: true,
      squadId: squad.id,
      memberCount: squad.members?.length || 0,
      templateVersion,
      templateName,
      phoneNumber,
    });
  } catch (error: any) {
    logger.error(
      { error: error?.message },
      '[Admin Redeploy] Failed to re-deploy squad',
    );
    return NextResponse.json(
      { error: error?.message || 'Failed to re-deploy squad' },
      { status: 500 },
    );
  }
}
