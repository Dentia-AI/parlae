import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import {
  parsePaginationParams,
  buildPagination,
  buildAccountSearchWhere,
} from '~/api/admin/_lib/admin-pagination';

/**
 * GET /api/admin/agent-templates/version-overview
 *
 * Returns paginated accounts with their current template version info,
 * plus global stats and version groups.
 *
 * Query params: page, limit, search, templateId, version, category
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
    const params = parsePaginationParams(new URL(request.url));

    const accountWhere: Record<string, unknown> = {};

    if (params.templateId) {
      accountWhere.agentTemplateId = params.templateId;
    }

    if (params.version) {
      accountWhere.agentTemplate = { version: params.version };
    }

    const where = buildAccountSearchWhere(params.search, accountWhere);

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where: where as any,
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
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.account.count({ where: where as any }),
    ]);

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
        _count: { select: { accounts: true } },
      },
      orderBy: [{ category: 'asc' }, { version: 'desc' }],
    });

    const defaultTemplate = templates.find((t) => t.isDefault && t.isActive);

    const accountOverviews = accounts.map((account) => {
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

    // Global stats
    const [totalAccounts, withTemplate] = await Promise.all([
      prisma.account.count(),
      prisma.account.count({ where: { agentTemplateId: { not: null } } }),
    ]);

    const onLatestDefault = defaultTemplate
      ? await prisma.account.count({ where: { agentTemplateId: defaultTemplate.id } })
      : 0;

    const versionGroups: Record<string, { version: string; templateName: string; count: number }> = {};
    for (const t of templates) {
      if (t._count.accounts > 0) {
        const key = t.version || 'unversioned';
        if (!versionGroups[key]) {
          versionGroups[key] = { version: key, templateName: t.name, count: 0 };
        }
        versionGroups[key]!.count += t._count.accounts;
      }
    }

    return NextResponse.json({
      success: true,
      accounts: accountOverviews,
      pagination: buildPagination(params.page, params.limit, total),
      versionGroups: Object.values(versionGroups),
      templates,
      defaultTemplate: defaultTemplate
        ? { id: defaultTemplate.id, version: defaultTemplate.version, name: defaultTemplate.name }
        : null,
      stats: {
        totalAccounts,
        withTemplate,
        onLatestDefault,
        uniqueVersions: Object.keys(versionGroups).length,
      },
    });
  } catch (error) {
    console.error('Version overview error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get version overview' },
      { status: 500 },
    );
  }
}
