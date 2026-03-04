import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import {
  parsePaginationParams,
  buildPagination,
  buildAccountSearchWhere,
} from '~/app/api/admin/_lib/admin-pagination';

/**
 * GET /api/admin/retell-templates/version-overview
 *
 * Returns paginated accounts with their current Retell template version info,
 * plus global stats and version groups.
 *
 * Query params: page, limit, search, templateId, version, status
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const params = parsePaginationParams(new URL(request.url));

    // Build account where clause
    const accountWhere: Record<string, unknown> = {};

    if (params.templateId) {
      accountWhere.retellAgentTemplateId = params.templateId;
    }

    if (params.version) {
      accountWhere.retellAgentTemplate = { version: params.version };
    }

    const where = buildAccountSearchWhere(params.search, accountWhere);

    // Paginated accounts query + total count
    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where: where as any,
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
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.account.count({ where: where as any }),
    ]);

    const templates = await prisma.retellAgentTemplate.findMany({
      select: {
        id: true,
        name: true,
        displayName: true,
        version: true,
        isActive: true,
        isDefault: true,
        _count: { select: { accounts: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { version: 'desc' }],
    });

    const defaultTemplate = templates.find((t) => t.isDefault && t.isActive);

    const accountOverviews = accounts.map((account) => {
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

    // Global stats (lightweight aggregation, not affected by pagination)
    const [totalAccounts, withTemplate] = await Promise.all([
      prisma.account.count(),
      prisma.account.count({ where: { retellAgentTemplateId: { not: null } } }),
    ]);

    const onLatestDefault = defaultTemplate
      ? await prisma.account.count({ where: { retellAgentTemplateId: defaultTemplate.id } })
      : 0;

    // Version groups from template assignment counts
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
    console.error('Retell version overview error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get Retell version overview' },
      { status: 500 },
    );
  }
}
