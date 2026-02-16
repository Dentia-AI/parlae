import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/server';
import {
  dbShapeToTemplate,
  buildSquadPayloadFromTemplate,
  getDentalClinicTemplate,
  compareTemplateVersions,
} from '@kit/shared/vapi/templates';
import type { TemplateVariables, RuntimeConfig, MigrationReport } from '@kit/shared/vapi/templates';

/**
 * POST /api/admin/agent-templates/bulk-upgrade
 *
 * Upgrade accounts to a new template version by re-creating their Vapi squads.
 *
 * Body:
 * {
 *   templateId: string;              // Target template ID to upgrade TO
 *   accountIds?: string[];           // Specific accounts (if omitted, upgrades ALL eligible)
 *   upgradeFromVersion?: string;     // Only upgrade accounts currently on this version
 *   dryRun?: boolean;                // If true, return plan without executing
 *   force?: boolean;                 // Skip version check, force upgrade even if same version
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   plan: { accountId, accountName, currentVersion, targetVersion, status }[];
 *   summary: { total, upgraded, skipped, failed };
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
    const {
      templateId,
      accountIds,
      upgradeFromVersion,
      dryRun = false,
      force = false,
    } = body;

    if (!templateId) {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 },
      );
    }

    // Load target template
    const template = await prisma.agentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 },
      );
    }

    if (!template.isActive) {
      return NextResponse.json(
        { error: 'Cannot upgrade to an inactive template' },
        { status: 400 },
      );
    }

    // Build the query to find eligible accounts
    const whereClause: any = {};

    if (accountIds && Array.isArray(accountIds) && accountIds.length > 0) {
      whereClause.id = { in: accountIds };
    }

    if (upgradeFromVersion) {
      // Only accounts whose phoneIntegrationSettings.templateVersion matches
      whereClause.phoneIntegrationSettings = {
        path: ['templateVersion'],
        equals: upgradeFromVersion,
      };
    }

    // If no specific filter, get all accounts with an agent deployed
    const accounts = await prisma.account.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        agentTemplateId: true,
        phoneIntegrationSettings: true,
      },
    });

    // Build upgrade plan
    type PlanEntry = {
      accountId: string;
      accountName: string | null;
      currentVersion: string | null;
      currentTemplate: string | null;
      targetVersion: string;
      targetTemplate: string;
      status: 'pending' | 'upgraded' | 'skipped' | 'failed';
      reason?: string;
    };

    const plan: PlanEntry[] = [];

    for (const account of accounts) {
      const settings = account.phoneIntegrationSettings as any;
      const currentVersion = settings?.templateVersion || null;
      const currentTemplate = settings?.templateName || null;
      const hasSquad = !!settings?.vapiSquadId;

      const entry: PlanEntry = {
        accountId: account.id,
        accountName: account.name,
        currentVersion,
        currentTemplate,
        targetVersion: template.version,
        targetTemplate: template.name,
        status: 'pending',
      };

      // Skip if already on same version (unless force)
      if (!force && currentVersion === template.version && account.agentTemplateId === templateId) {
        entry.status = 'skipped';
        entry.reason = 'Already on target version';
      }

      // Skip if no squad deployed and no way to create one (no phone number)
      if (!hasSquad && entry.status === 'pending') {
        entry.status = 'skipped';
        entry.reason = 'No squad deployed for this account';
      }

      plan.push(entry);
    }

    // Run migration comparison for warnings
    let migrationReport: MigrationReport | null = null;
    try {
      const newTemplateConfig = dbShapeToTemplate(template as any);

      // Compare against the currently most-used template version
      // (find the most common current template among the upgrade candidates)
      const pendingAccounts = plan.filter((p) => p.status === 'pending');
      if (pendingAccounts.length > 0) {
        const firstCurrent = pendingAccounts[0];
        if (firstCurrent?.currentTemplate) {
          // Try to find the current template in DB
          const currentDbTemplate = await prisma.agentTemplate.findFirst({
            where: { name: firstCurrent.currentTemplate },
            orderBy: { createdAt: 'desc' },
          });

          if (currentDbTemplate) {
            const oldTemplateConfig = dbShapeToTemplate(currentDbTemplate as any);
            migrationReport = compareTemplateVersions(oldTemplateConfig, newTemplateConfig);
          }
        }

        // If no DB template found, compare against built-in default
        if (!migrationReport) {
          const builtInTemplate = getDentalClinicTemplate();
          migrationReport = compareTemplateVersions(builtInTemplate, newTemplateConfig);
        }
      }
    } catch (compareError) {
      console.warn('Failed to run migration comparison:', compareError);
      // Non-fatal — continue without migration report
    }

    // If dry run, return the plan without executing
    if (dryRun) {
      const summary = {
        total: plan.length,
        willUpgrade: plan.filter((p) => p.status === 'pending').length,
        willSkip: plan.filter((p) => p.status === 'skipped').length,
      };

      return NextResponse.json({
        success: true,
        dryRun: true,
        plan,
        summary,
        migration: migrationReport,
        template: {
          id: template.id,
          name: template.name,
          version: template.version,
          displayName: template.displayName,
        },
      });
    }

    // Execute the upgrade
    const vapiService = createVapiService();
    const templateConfig = dbShapeToTemplate(template as any);

    for (const entry of plan) {
      if (entry.status !== 'pending') continue;

      try {
        const account = accounts.find((a) => a.id === entry.accountId);
        if (!account) {
          entry.status = 'failed';
          entry.reason = 'Account not found in loaded set';
          continue;
        }

        const settings = (account.phoneIntegrationSettings as any) ?? {};

        // Build template variables from account data
        const templateVars: TemplateVariables = {
          clinicName: account.name || 'Clinic',
          clinicHours: settings.clinicHours,
          clinicLocation: settings.clinicLocation,
          clinicInsurance: settings.clinicInsurance,
          clinicServices: settings.clinicServices,
        };

        // Determine the clinic phone number for human transfer
        const clinicPhoneNumber =
          settings.staffDirectNumber ||
          settings.clinicNumber ||
          undefined;

        const runtimeConfig: RuntimeConfig = {
          webhookUrl: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`,
          webhookSecret: process.env.VAPI_SERVER_SECRET,
          knowledgeFileIds: settings.knowledgeBaseFileIds || [],
          clinicPhoneNumber,
        };

        // Build the new squad payload
        const squadPayload = buildSquadPayloadFromTemplate(
          templateConfig,
          templateVars,
          runtimeConfig,
        );

        // Delete old squad if it exists
        const oldSquadId = settings.vapiSquadId;
        if (oldSquadId) {
          try {
            await vapiService.deleteSquad(oldSquadId);
          } catch (deleteError) {
            // Non-fatal: old squad might already be deleted
            console.warn(
              `Failed to delete old squad ${oldSquadId} for account ${entry.accountId}:`,
              deleteError,
            );
          }
        }

        // Create new squad
        const newSquad = await vapiService.createSquad(squadPayload);

        if (!newSquad) {
          entry.status = 'failed';
          entry.reason = 'Failed to create new squad in Vapi';
          continue;
        }

        // Save upgrade history before overwriting settings
        const upgradeHistory = settings.upgradeHistory || [];
        upgradeHistory.push({
          fromVersion: entry.currentVersion,
          fromTemplate: entry.currentTemplate,
          toVersion: template.version,
          toTemplate: template.name,
          oldSquadId,
          newSquadId: newSquad.id,
          upgradedAt: new Date().toISOString(),
          upgradedBy: session.id,
        });

        // Update account with new template reference
        await prisma.account.update({
          where: { id: entry.accountId },
          data: {
            agentTemplateId: templateId,
            phoneIntegrationSettings: {
              ...settings,
              vapiSquadId: newSquad.id,
              templateVersion: template.version,
              templateName: template.name,
              lastTemplateUpdate: new Date().toISOString(),
              upgradeHistory,
            },
          },
        });

        entry.status = 'upgraded';
      } catch (error) {
        entry.status = 'failed';
        entry.reason =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `Failed to upgrade account ${entry.accountId}:`,
          error,
        );
      }
    }

    const summary = {
      total: plan.length,
      upgraded: plan.filter((p) => p.status === 'upgraded').length,
      skipped: plan.filter((p) => p.status === 'skipped').length,
      failed: plan.filter((p) => p.status === 'failed').length,
    };

    return NextResponse.json({
      success: true,
      dryRun: false,
      plan,
      summary,
      template: {
        id: template.id,
        name: template.name,
        version: template.version,
        displayName: template.displayName,
      },
    });
  } catch (error) {
    console.error('Bulk upgrade error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to run bulk upgrade',
      },
      { status: 500 },
    );
  }
}
