import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/server';
import {
  dbShapeToTemplate,
  getDentalClinicTemplate,
  buildSquadPayloadFromTemplate,
  DENTAL_CLINIC_TEMPLATE_VERSION,
} from '@kit/shared/vapi/templates';
import type { TemplateVariables, RuntimeConfig } from '@kit/shared/vapi/templates';

/**
 * POST /api/admin/agent-templates/rollback
 *
 * Rollback an account (or multiple) to a previous template version.
 * Uses the upgradeHistory stored in phoneIntegrationSettings to identify
 * the previous version, or allows specifying a target template directly.
 *
 * Body:
 * {
 *   accountIds: string[];              // Accounts to rollback
 *   targetTemplateId?: string;         // Specific template to rollback TO (if omitted, uses previous from history)
 *   useBuiltIn?: boolean;             // Rollback to built-in default template instead of DB template
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();

    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { accountIds, targetTemplateId, useBuiltIn = false } = body;

    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return NextResponse.json(
        { error: 'accountIds is required and must be a non-empty array' },
        { status: 400 },
      );
    }

    const vapiService = createVapiService();

    type RollbackResult = {
      accountId: string;
      accountName: string | null;
      fromVersion: string | null;
      toVersion: string;
      toTemplate: string;
      status: 'rolled_back' | 'failed' | 'no_history';
      reason?: string;
    };

    const results: RollbackResult[] = [];

    for (const accountId of accountIds) {
      try {
        const account = await prisma.account.findUnique({
          where: { id: accountId },
          select: {
            id: true,
            name: true,
            agentTemplateId: true,
            phoneIntegrationSettings: true,
          },
        });

        if (!account) {
          results.push({
            accountId,
            accountName: null,
            fromVersion: null,
            toVersion: '',
            toTemplate: '',
            status: 'failed',
            reason: 'Account not found',
          });
          continue;
        }

        const settings = (account.phoneIntegrationSettings as any) ?? {};
        const currentVersion = settings.templateVersion || null;

        // Determine the target template
        let templateConfig;
        let targetVersion: string;
        let targetName: string;
        let targetDbTemplateId: string | null = null;

        if (useBuiltIn) {
          // Rollback to built-in default
          templateConfig = getDentalClinicTemplate();
          targetVersion = DENTAL_CLINIC_TEMPLATE_VERSION;
          targetName = templateConfig.name;
        } else if (targetTemplateId) {
          // Rollback to a specific DB template
          const dbTemplate = await prisma.agentTemplate.findUnique({
            where: { id: targetTemplateId },
          });

          if (!dbTemplate) {
            results.push({
              accountId,
              accountName: account.name,
              fromVersion: currentVersion,
              toVersion: '',
              toTemplate: '',
              status: 'failed',
              reason: `Target template ${targetTemplateId} not found`,
            });
            continue;
          }

          templateConfig = dbShapeToTemplate(dbTemplate as any);
          targetVersion = dbTemplate.version;
          targetName = dbTemplate.name;
          targetDbTemplateId = dbTemplate.id;
        } else {
          // Auto-detect from upgrade history
          const history = settings.upgradeHistory || [];

          if (history.length === 0) {
            results.push({
              accountId,
              accountName: account.name,
              fromVersion: currentVersion,
              toVersion: '',
              toTemplate: '',
              status: 'no_history',
              reason: 'No upgrade history found. Specify targetTemplateId or useBuiltIn.',
            });
            continue;
          }

          // Get the most recent entry's "from" version
          const lastUpgrade = history[history.length - 1];
          const previousTemplateName = lastUpgrade.fromTemplate;

          if (!previousTemplateName) {
            // If no previous template name, fall back to built-in
            templateConfig = getDentalClinicTemplate();
            targetVersion = DENTAL_CLINIC_TEMPLATE_VERSION;
            targetName = templateConfig.name;
          } else {
            // Try to find the previous template in DB
            const prevTemplate = await prisma.agentTemplate.findFirst({
              where: {
                name: previousTemplateName,
              },
              orderBy: { createdAt: 'desc' },
            });

            if (prevTemplate) {
              templateConfig = dbShapeToTemplate(prevTemplate as any);
              targetVersion = prevTemplate.version;
              targetName = prevTemplate.name;
              targetDbTemplateId = prevTemplate.id;
            } else {
              // Previous template no longer exists, fall back to built-in
              templateConfig = getDentalClinicTemplate();
              targetVersion = DENTAL_CLINIC_TEMPLATE_VERSION;
              targetName = templateConfig.name;
            }
          }
        }

        // Build template variables
        const templateVars: TemplateVariables = {
          clinicName: account.name || 'Clinic',
          clinicHours: settings.clinicHours,
          clinicLocation: settings.clinicLocation,
          clinicInsurance: settings.clinicInsurance,
          clinicServices: settings.clinicServices,
        };

        const runtimeConfig: RuntimeConfig = {
          webhookUrl: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`,
          webhookSecret: process.env.VAPI_SERVER_SECRET,
          knowledgeFileIds: settings.knowledgeBaseFileIds || [],
        };

        // Build squad payload
        const squadPayload = buildSquadPayloadFromTemplate(
          templateConfig,
          templateVars,
          runtimeConfig,
        );

        // Delete old squad
        const oldSquadId = settings.vapiSquadId;
        if (oldSquadId) {
          try {
            await vapiService.deleteSquad(oldSquadId);
          } catch {
            console.warn(`Failed to delete old squad ${oldSquadId}`);
          }
        }

        // Create new squad
        const newSquad = await vapiService.createSquad(squadPayload);

        if (!newSquad) {
          results.push({
            accountId,
            accountName: account.name,
            fromVersion: currentVersion,
            toVersion: targetVersion,
            toTemplate: targetName,
            status: 'failed',
            reason: 'Failed to create new squad in Vapi',
          });
          continue;
        }

        // Record rollback in history
        const upgradeHistory = settings.upgradeHistory || [];
        upgradeHistory.push({
          fromVersion: currentVersion,
          fromTemplate: settings.templateName,
          toVersion: targetVersion,
          toTemplate: targetName,
          oldSquadId,
          newSquadId: newSquad.id,
          upgradedAt: new Date().toISOString(),
          upgradedBy: session.id,
          isRollback: true,
        });

        // Update account
        await prisma.account.update({
          where: { id: accountId },
          data: {
            agentTemplateId: targetDbTemplateId,
            phoneIntegrationSettings: {
              ...settings,
              vapiSquadId: newSquad.id,
              templateVersion: targetVersion,
              templateName: targetName,
              lastTemplateUpdate: new Date().toISOString(),
              upgradeHistory,
            },
          },
        });

        results.push({
          accountId,
          accountName: account.name,
          fromVersion: currentVersion,
          toVersion: targetVersion,
          toTemplate: targetName,
          status: 'rolled_back',
        });
      } catch (error) {
        results.push({
          accountId,
          accountName: null,
          fromVersion: null,
          toVersion: '',
          toTemplate: '',
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const summary = {
      total: results.length,
      rolledBack: results.filter((r) => r.status === 'rolled_back').length,
      failed: results.filter((r) => r.status === 'failed').length,
      noHistory: results.filter((r) => r.status === 'no_history').length,
    };

    return NextResponse.json({ success: true, results, summary });
  } catch (error) {
    console.error('Rollback error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to run rollback',
      },
      { status: 500 },
    );
  }
}
