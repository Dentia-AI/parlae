import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';
import { createVapiService } from '@kit/shared/vapi/server';
import { getLogger } from '@kit/shared/logger';
import {
  getDentalClinicTemplate,
  buildAllMemberPrompts,
  dbShapeToTemplate,
  DENTAL_CLINIC_TEMPLATE_VERSION,
} from '@kit/shared/vapi/templates';
import type { TemplateVariables } from '@kit/shared/vapi/templates';

/**
 * POST /api/admin/update-squad-prompts
 *
 * Admin-only endpoint that patches the system prompts of existing Vapi
 * assistants **in-place** without recreating the squad or assistants.
 *
 * Use this instead of full recreation when only prompt content changed
 * (no tool, voice, or structural changes).
 *
 * Body: { accountId: string }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        agentTemplateId: true,
        brandingBusinessName: true,
        brandingContactPhone: true,
        setupProgress: true,
        phoneIntegrationSettings: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const phoneIntegrationSettings = (account.phoneIntegrationSettings as any) ?? {};
    const squadId = phoneIntegrationSettings.vapiSquadId;

    if (!squadId) {
      return NextResponse.json(
        { error: 'No squad deployed for this account. Use full recreation instead.' },
        { status: 400 },
      );
    }

    const vapiService = createVapiService();

    // Fetch current squad from Vapi to get assistant IDs and names
    const squad = await vapiService.getSquad(squadId);
    if (!squad || !squad.members?.length) {
      return NextResponse.json(
        { error: `Squad ${squadId} not found in Vapi or has no members.` },
        { status: 404 },
      );
    }

    const businessName =
      account.brandingBusinessName ||
      phoneIntegrationSettings.businessName ||
      account.name;
    const setupProgress = (account.setupProgress as Record<string, any>) ?? {};

    // Resolve template variables (same as redeploy)
    const templateVars: TemplateVariables = {
      clinicName: businessName,
      clinicHours: setupProgress.businessHours,
      clinicLocation: setupProgress.businessLocation,
      clinicInsurance: setupProgress.insuranceInfo,
      clinicServices: setupProgress.servicesOffered,
    };

    const clinicOriginalNumber =
      phoneIntegrationSettings.staffDirectNumber ||
      phoneIntegrationSettings.clinicNumber ||
      account.brandingContactPhone ||
      undefined;

    // Resolve which template to use (same logic as redeploy)
    let templateConfig;
    let templateVersion: string;
    const builtInTemplate = getDentalClinicTemplate();
    const builtInVersion = DENTAL_CLINIC_TEMPLATE_VERSION;

    if (account.agentTemplateId) {
      const dbTemplate = await prisma.agentTemplate.findUnique({
        where: { id: account.agentTemplateId },
      });

      if (dbTemplate && dbTemplate.isActive && dbTemplate.version > builtInVersion) {
        templateConfig = dbShapeToTemplate(dbTemplate as any);
        templateVersion = dbTemplate.version;
      } else {
        templateConfig = builtInTemplate;
        templateVersion = builtInVersion;
      }
    } else {
      templateConfig = builtInTemplate;
      templateVersion = builtInVersion;
    }

    // Build hydrated prompts for every template member
    const prompts = buildAllMemberPrompts(templateConfig, templateVars, {
      queryToolId: phoneIntegrationSettings.queryToolId,
      queryToolName: phoneIntegrationSettings.queryToolName,
      clinicPhoneNumber: clinicOriginalNumber,
    });

    // Build a lookup: assistant name → new system prompt
    const promptByName = new Map(prompts.map((p) => [p.assistantName, p.systemPrompt]));

    logger.info(
      { accountId, squadId, templateVersion, memberCount: squad.members.length, promptCount: prompts.length },
      '[UpdatePrompts] Starting in-place prompt update',
    );

    // PATCH each assistant
    const results: { assistantId: string; name: string; updated: boolean }[] = [];

    for (const member of squad.members) {
      const assistantId = member.assistantId;
      if (!assistantId) continue;

      // Get the assistant name from Vapi to match against template
      const assistantData = await vapiService.getAssistant(assistantId);
      const assistantName = (assistantData as any)?.name || '';

      const newPrompt = promptByName.get(assistantName);
      if (!newPrompt) {
        logger.warn(
          { assistantId, assistantName, templateMembers: Array.from(promptByName.keys()) },
          '[UpdatePrompts] No matching template prompt for assistant — skipping',
        );
        results.push({ assistantId, name: assistantName, updated: false });
        continue;
      }

      const result = await vapiService.updateAssistantSystemPrompt(assistantId, newPrompt);
      results.push({
        assistantId,
        name: result.assistantName || assistantName,
        updated: result.success,
      });

      // Small delay between API calls to avoid rate limits
      await new Promise((r) => setTimeout(r, 300));
    }

    const updatedCount = results.filter((r) => r.updated).length;
    const failedCount = results.filter((r) => !r.updated).length;

    // Update template version in account settings
    await prisma.account.update({
      where: { id: account.id },
      data: {
        phoneIntegrationSettings: {
          ...phoneIntegrationSettings,
          templateVersion,
          lastPromptUpdateAt: new Date().toISOString(),
        },
      },
    });

    logger.info(
      { accountId, squadId, templateVersion, updatedCount, failedCount },
      '[UpdatePrompts] Prompt update completed',
    );

    return NextResponse.json({
      success: true,
      squadId,
      templateVersion,
      updatedCount,
      failedCount,
      results,
    });
  } catch (error: any) {
    logger.error({ error: error?.message }, '[UpdatePrompts] Failed to update prompts');
    return NextResponse.json(
      { error: error?.message || 'Failed to update prompts' },
      { status: 500 },
    );
  }
}
