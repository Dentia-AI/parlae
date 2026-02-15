import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';

/**
 * GET /api/admin/agent-templates/version-overview
 *
 * Returns all accounts with their current template version info,
 * grouped by version for easy overview.
 *
 * Query params:
 *   category?: string    - Filter by template category
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser();

    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    // Get all accounts with their template info
    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        agentTemplateId: true,
        phoneIntegrationSettings: true,
        agentTemplate: {
          select: {
            id: true,
            name: true,
            displayName: true,
            version: true,
            category: true,
            isActive: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get all templates for the dropdown/comparison
    const templateWhere: any = {};
    if (category) {
      templateWhere.category = category;
    }

    const templates = await prisma.agentTemplate.findMany({
      where: templateWhere,
      select: {
        id: true,
        name: true,
        displayName: true,
        version: true,
        category: true,
        isActive: true,
        isDefault: true,
        _count: {
          select: { accounts: true },
        },
      },
      orderBy: [{ category: 'asc' }, { version: 'desc' }],
    });

    // Build the overview
    type AccountOverview = {
      accountId: string;
      accountName: string | null;
      accountEmail: string | null;
      templateId: string | null;
      templateName: string | null;
      templateDisplayName: string | null;
      templateVersion: string | null;
      templateCategory: string | null;
      hasSquad: boolean;
      hasUpgradeHistory: boolean;
      upgradeCount: number;
      lastUpgradeDate: string | null;
      lastUpgradeBy: string | null;
      isOnLatestDefault: boolean;
    };

    // Find the default template for comparison
    const defaultTemplate = templates.find((t) => t.isDefault && t.isActive);

    const accountOverviews: AccountOverview[] = accounts.map((account) => {
      const settings = account.phoneIntegrationSettings as any;
      const history = settings?.upgradeHistory || [];

      return {
        accountId: account.id,
        accountName: account.name,
        accountEmail: account.email,
        templateId: account.agentTemplateId,
        templateName: settings?.templateName || account.agentTemplate?.name || null,
        templateDisplayName: account.agentTemplate?.displayName || null,
        templateVersion: settings?.templateVersion || account.agentTemplate?.version || null,
        templateCategory: account.agentTemplate?.category || null,
        hasSquad: !!settings?.vapiSquadId,
        hasUpgradeHistory: history.length > 0,
        upgradeCount: history.length,
        lastUpgradeDate: settings?.lastTemplateUpdate || null,
        lastUpgradeBy: history.length > 0 ? history[history.length - 1]?.upgradedBy : null,
        isOnLatestDefault: defaultTemplate
          ? account.agentTemplateId === defaultTemplate.id
          : false,
      };
    });

    // Group by version for summary stats
    const versionGroups: Record<
      string,
      { version: string; templateName: string; count: number; accountIds: string[] }
    > = {};

    for (const overview of accountOverviews) {
      if (!overview.hasSquad) continue;

      const key = overview.templateVersion || 'unversioned';
      if (!versionGroups[key]) {
        versionGroups[key] = {
          version: key,
          templateName: overview.templateName || 'Unknown',
          count: 0,
          accountIds: [],
        };
      }
      versionGroups[key].count++;
      versionGroups[key].accountIds.push(overview.accountId);
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
        withSquad: accountOverviews.filter((a) => a.hasSquad).length,
        withoutSquad: accountOverviews.filter((a) => !a.hasSquad).length,
        onLatestDefault: accountOverviews.filter((a) => a.isOnLatestDefault).length,
        uniqueVersions: Object.keys(versionGroups).length,
      },
    });
  } catch (error) {
    console.error('Version overview error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get version overview',
      },
      { status: 500 },
    );
  }
}
