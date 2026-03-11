import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import {
  parsePaginationParams,
  buildPagination,
  buildAccountSearchWhere,
} from '~/api/admin/_lib/admin-pagination';

/**
 * GET /api/admin/retell-templates/conversation-flow/version-overview
 *
 * Returns paginated accounts with their conversation flow template version,
 * plus global stats and version groups.
 *
 * Query params: page, limit, search, templateId, version
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const params = parsePaginationParams(new URL(request.url));

    const accountWhere: Record<string, unknown> = {};

    if (params.templateId) {
      accountWhere.retellFlowTemplateId = params.templateId;
    }

    if (params.version) {
      accountWhere.retellFlowTemplate = { version: params.version };
    }

    const where = buildAccountSearchWhere(params.search, accountWhere);

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where: where as any,
        select: {
          id: true,
          name: true,
          email: true,
          retellFlowTemplateId: true,
          phoneIntegrationSettings: true,
          retellFlowTemplate: {
            select: {
              id: true,
              name: true,
              displayName: true,
              version: true,
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

    const templates = await prisma.retellConversationFlowTemplate.findMany({
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
      const settings = account.phoneIntegrationSettings as any;
      const hasFlowAgent = !!settings?.conversationFlowId;
      const deployedVersion: string | null = settings?.retellVersion || null;

      return {
        accountId: account.id,
        accountName: account.name,
        accountEmail: account.email,
        templateId: account.retellFlowTemplateId,
        templateName: account.retellFlowTemplate?.name || null,
        templateDisplayName: account.retellFlowTemplate?.displayName || null,
        templateVersion: account.retellFlowTemplate?.version || null,
        deployedVersion,
        hasFlowAgent,
        conversationFlowId: settings?.conversationFlowId || null,
        agentId: settings?.retellReceptionistAgentId || null,
        isOnLatestDefault: defaultTemplate
          ? deployedVersion != null && deployedVersion === defaultTemplate.version
          : false,
      };
    });

    // Global stats
    const [totalAccounts, withTemplate] = await Promise.all([
      prisma.account.count(),
      prisma.account.count({ where: { retellFlowTemplateId: { not: null } } }),
    ]);

    let onLatestDefault = 0;
    if (defaultTemplate) {
      const allAccounts = await prisma.account.findMany({
        where: { retellFlowTemplateId: { not: null } },
        select: { phoneIntegrationSettings: true },
      });
      onLatestDefault = allAccounts.filter((a: any) => {
        const ver = (a.phoneIntegrationSettings as any)?.retellVersion;
        return ver != null && ver === defaultTemplate.version;
      }).length;
    }

    const versionGroups: Record<string, { version: string; templateName: string; count: number }> = {};
    const allAccountsForVersions = await prisma.account.findMany({
      where: { retellFlowTemplateId: { not: null } },
      select: {
        phoneIntegrationSettings: true,
        retellFlowTemplate: { select: { name: true } },
      },
    });
    for (const a of allAccountsForVersions) {
      const deployedVer = (a.phoneIntegrationSettings as any)?.retellVersion;
      const key = deployedVer || 'not-deployed';
      const tplName = (a as any).retellFlowTemplate?.name || 'unknown';
      if (!versionGroups[key]) {
        versionGroups[key] = { version: key, templateName: tplName, count: 0 };
      }
      versionGroups[key]!.count++;
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get flow version overview' },
      { status: 500 },
    );
  }
}
