import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import {
  parsePaginationParams,
  buildPagination,
  buildAccountSearchWhere,
} from '~/api/admin/_lib/admin-pagination';

/**
 * GET /api/admin/outbound-templates/version-overview
 *
 * Returns paginated accounts with their outbound agent status, template versions,
 * and agent group enablement for the version overview page.
 *
 * Query params: page, limit, search, templateId, version
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const params = parsePaginationParams(new URL(request.url));

    const accountWhere: Record<string, unknown> = { isPersonalAccount: true };
    const where = buildAccountSearchWhere(params.search, accountWhere);

    // Outbound has its own template version in outboundSettings, so version/template
    // filtering requires a subquery approach via settings
    const settingsFilter: Record<string, unknown> = {};
    if (params.version) {
      settingsFilter.outboundTemplateVersion = params.version;
    }

    const hasSettingsFilter = Object.keys(settingsFilter).length > 0;
    let filteredAccountIds: string[] | null = null;

    if (hasSettingsFilter) {
      const matchedSettings = await prisma.outboundSettings.findMany({
        where: settingsFilter as any,
        select: { accountId: true },
      });
      filteredAccountIds = matchedSettings.map((s) => s.accountId);
      (where as any).id = { in: filteredAccountIds };
    }

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where: where as any,
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.account.count({ where: where as any }),
    ]);

    const accountIds = accounts.map((a) => a.id);
    const pageSettings = await prisma.outboundSettings.findMany({
      where: { accountId: { in: accountIds } },
      select: {
        accountId: true,
        patientCareEnabled: true,
        financialEnabled: true,
        patientCareRetellAgentId: true,
        financialRetellAgentId: true,
        outboundTemplateVersion: true,
      },
    });
    const settingsMap = new Map(pageSettings.map((s) => [s.accountId, s]));

    const templates = await prisma.outboundAgentTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const latestVersionByGroup: Record<string, string> = {};
    for (const t of templates) {
      if (t.isActive && !latestVersionByGroup[t.agentGroup]) {
        latestVersionByGroup[t.agentGroup] = t.version;
      }
    }

    const accountOverviews = accounts.map((account) => {
      const s = settingsMap.get(account.id);
      return {
        accountId: account.id,
        accountName: account.name,
        accountEmail: account.email,
        patientCareEnabled: s?.patientCareEnabled || false,
        financialEnabled: s?.financialEnabled || false,
        patientCareAgentId: s?.patientCareRetellAgentId || null,
        financialAgentId: s?.financialRetellAgentId || null,
        outboundTemplateVersion: s?.outboundTemplateVersion || null,
        hasOutboundAgent: !!(s?.patientCareRetellAgentId || s?.financialRetellAgentId),
        isOnLatest:
          s?.outboundTemplateVersion != null &&
          (s.outboundTemplateVersion === latestVersionByGroup['PATIENT_CARE'] ||
           s.outboundTemplateVersion === latestVersionByGroup['FINANCIAL']),
      };
    });

    // Global stats (across all accounts, not just this page)
    const allSettings = await prisma.outboundSettings.findMany({
      select: {
        patientCareEnabled: true,
        financialEnabled: true,
        patientCareRetellAgentId: true,
        financialRetellAgentId: true,
        outboundTemplateVersion: true,
      },
    });

    const versionGroupsMap: Record<string, { version: string; count: number }> = {};
    let withOutboundAgent = 0;
    let patientCareEnabledCount = 0;
    let financialEnabledCount = 0;
    let onLatest = 0;

    for (const s of allSettings) {
      if (s.patientCareRetellAgentId || s.financialRetellAgentId) withOutboundAgent++;
      if (s.patientCareEnabled) patientCareEnabledCount++;
      if (s.financialEnabled) financialEnabledCount++;

      const isOnLat = s.outboundTemplateVersion != null &&
        (s.outboundTemplateVersion === latestVersionByGroup['PATIENT_CARE'] ||
         s.outboundTemplateVersion === latestVersionByGroup['FINANCIAL']);
      if (isOnLat) onLatest++;

      if (s.outboundTemplateVersion || s.patientCareRetellAgentId || s.financialRetellAgentId) {
        const ver = s.outboundTemplateVersion || 'unversioned';
        if (!versionGroupsMap[ver]) {
          versionGroupsMap[ver] = { version: ver, count: 0 };
        }
        versionGroupsMap[ver]!.count++;
      }
    }

    const totalAccounts = await prisma.account.count({ where: { isPersonalAccount: true } });

    return NextResponse.json({
      success: true,
      accounts: accountOverviews,
      pagination: buildPagination(params.page, params.limit, total),
      versionGroups: Object.values(versionGroupsMap),
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        agentGroup: t.agentGroup,
        version: t.version,
        isActive: t.isActive,
      })),
      latestVersionByGroup,
      stats: {
        totalAccounts,
        withOutboundAgent,
        patientCareEnabled: patientCareEnabledCount,
        financialEnabled: financialEnabledCount,
        onLatest,
        uniqueVersions: Object.keys(versionGroupsMap).length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get outbound version overview' },
      { status: 500 },
    );
  }
}
