import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';
import { createVapiService } from '@kit/shared/vapi/server';
import { getLogger } from '@kit/shared/logger';
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
    const { accountId, deleteOldSquad = true } = body;

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

    // STEP 1: Delete old squad if it exists
    const oldSquadId = phoneIntegrationSettings.vapiSquadId;
    if (deleteOldSquad && oldSquadId) {
      try {
        await vapiService.deleteSquad(oldSquadId);
        logger.info(
          { oldSquadId },
          '[Admin Redeploy] Deleted old squad',
        );
      } catch (err: any) {
        logger.warn(
          { oldSquadId, error: err?.message },
          '[Admin Redeploy] Failed to delete old squad (may not exist)',
        );
      }
    }

    // STEP 2: Collect knowledge base file IDs from existing deployment
    const knowledgeFileIds: string[] =
      phoneIntegrationSettings.knowledgeBaseFileIds || [];

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
      phoneIntegrationSettings.staffDirectNumber ||
      phoneIntegrationSettings.clinicNumber ||
      account.brandingContactPhone ||
      undefined;

    logger.info(
      { clinicOriginalNumber, staffDirect: phoneIntegrationSettings.staffDirectNumber, clinicNum: phoneIntegrationSettings.clinicNumber, brandingPhone: account.brandingContactPhone },
      '[Admin Redeploy] Resolved clinic phone for emergency transfers',
    );

    const webhookBaseUrl =
      process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://app.parlae.ca';
    const runtimeConfig: RuntimeConfig = {
      webhookUrl: `${webhookBaseUrl}/api/vapi/webhook`,
      webhookSecret: process.env.VAPI_SERVER_SECRET,
      knowledgeFileIds,
      clinicPhoneNumber: clinicOriginalNumber,
    };

    // STEP 4: Load template
    let templateConfig;
    let templateVersion: string;
    let templateName: string;

    if (account.agentTemplateId) {
      const dbTemplate = await prisma.agentTemplate.findUnique({
        where: { id: account.agentTemplateId },
      });

      if (dbTemplate && dbTemplate.isActive) {
        templateConfig = dbShapeToTemplate(dbTemplate as any);
        templateVersion = dbTemplate.version;
        templateName = dbTemplate.name;
      } else {
        templateConfig = getDentalClinicTemplate();
        templateVersion = DENTAL_CLINIC_TEMPLATE_VERSION;
        templateName = templateConfig.name;
      }
    } else {
      templateConfig = getDentalClinicTemplate();
      templateVersion = DENTAL_CLINIC_TEMPLATE_VERSION;
      templateName = templateConfig.name;
    }

    // STEP 5: Apply voice from existing deployment (if any)
    const voiceConfig = phoneIntegrationSettings.voiceConfig;
    if (voiceConfig && templateConfig.members) {
      for (const member of templateConfig.members) {
        if (member.assistant) {
          member.assistant.voice = {
            provider: voiceConfig.provider as any,
            voiceId: voiceConfig.voiceId,
            stability: 0.5,
            similarityBoost: 0.75,
          };
        }
      }

      const triageMember = templateConfig.members[0];
      if (triageMember?.assistant) {
        triageMember.assistant.firstMessage =
          `Thank you for calling ${businessName}! I'm ${voiceConfig.name || 'Nova'}. How can I help you today?`;
      }
    }

    // STEP 6: Build and create the squad
    const squadPayload = buildSquadPayloadFromTemplate(
      templateConfig,
      templateVars,
      runtimeConfig,
    );
    (squadPayload as any).name = `${businessName} Squad`;

    const squad = await vapiService.createSquad(squadPayload as any);

    if (!squad) {
      return NextResponse.json(
        { error: 'Failed to create Vapi squad' },
        { status: 500 },
      );
    }

    logger.info(
      { squadId: squad.id, memberCount: squad.members?.length },
      '[Admin Redeploy] Created new squad',
    );

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

    // STEP 8: Update account DB
    await prisma.account.update({
      where: { id: account.id },
      data: {
        phoneIntegrationSettings: {
          ...phoneIntegrationSettings,
          vapiSquadId: squad.id,
          templateVersion,
          templateName,
          lastRedeployedAt: new Date().toISOString(),
        },
      },
    });

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
