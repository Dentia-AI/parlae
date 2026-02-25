import { NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';

/**
 * GET /api/admin/retell-templates/version-overview
 *
 * Returns all accounts with their current Retell template version info,
 * grouped by version for overview. Mirrors the Vapi version-overview route.
 */
export async function GET() {
  try {
    await requireAdmin();

    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        retellAgentTemplateId: true,
        phoneIntegrationSettings: true,
        retellAgentTemplate: {
          select: {
            id: true,
            name: true,
            displayName: true,
            version: true,
            isActive: true,
          },
        },
        retellPhoneNumbers: {
          select: {
            id: true,
            retellAgentId: true,
            retellAgentIds: true,
            isActive: true,
          },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });

    const templates = await prisma.retellAgentTemplate.findMany({
      select: {
        id: true,
        name: true,
        displayName: true,
        version: true,
        isActive: true,
        isDefault: true,
        _count: {
          select: { accounts: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { version: 'desc' }],
    });

    const defaultTemplate = templates.find((t) => t.isDefault && t.isActive);

    type AccountOverview = {
      accountId: string;
      accountName: string | null;
      accountEmail: string | null;
      templateId: string | null;
      templateName: string | null;
      templateDisplayName: string | null;
      templateVersion: string | null;
      hasRetellAgents: boolean;
      retellAgentCount: number;
      isOnLatestDefault: boolean;
    };

    const accountOverviews: AccountOverview[] = accounts.map((account) => {
      const retellDeployment = account.retellPhoneNumbers[0];
      const agentIds = retellDeployment?.retellAgentIds as Record<string, any> | null;
      const agentCount = agentIds ? Object.keys(agentIds).length : 0;

      return {
        accountId: account.id,
        accountName: account.name,
        accountEmail: account.email,
        templateId: account.retellAgentTemplateId,
        templateName: account.retellAgentTemplate?.name || null,
        templateDisplayName: account.retellAgentTemplate?.displayName || null,
        templateVersion: account.retellAgentTemplate?.version || null,
        hasRetellAgents: agentCount > 0,
        retellAgentCount: agentCount,
        isOnLatestDefault: defaultTemplate
          ? account.retellAgentTemplateId === defaultTemplate.id
          : false,
      };
    });

    const versionGroups: Record<
      string,
      { version: string; templateName: string; count: number; accountIds: string[] }
    > = {};

    for (const overview of accountOverviews) {
      if (!overview.hasRetellAgents && !overview.templateId) continue;

      const key = overview.templateVersion || 'unversioned';
      if (!versionGroups[key]) {
        versionGroups[key] = {
          version: key,
          templateName: overview.templateName || 'Unknown',
          count: 0,
          accountIds: [],
        };
      }
      versionGroups[key]!.count++;
      versionGroups[key]!.accountIds.push(overview.accountId);
    }

    return NextResponse.json({
      success: true,
      accounts: accountOverviews,
      versionGroups: Object.values(versionGroups),
      templates,
      defaultTemplate: defaultTemplate
        ? { id: defaultTemplate.id, version: defaultTemplate.version, name: defaultTemplate.name }
        : null,
      stats: {
        totalAccounts: accounts.length,
        withRetellAgents: accountOverviews.filter((a) => a.hasRetellAgents).length,
        withoutRetellAgents: accountOverviews.filter((a) => !a.hasRetellAgents).length,
        withTemplate: accountOverviews.filter((a) => a.templateId).length,
        onLatestDefault: accountOverviews.filter((a) => a.isOnLatestDefault).length,
        uniqueVersions: Object.keys(versionGroups).length,
      },
    });
  } catch (error) {
    console.error('Retell version overview error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get Retell version overview',
      },
      { status: 500 },
    );
  }
}
