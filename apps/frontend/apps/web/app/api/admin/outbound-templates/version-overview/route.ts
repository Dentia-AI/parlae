import { NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';

/**
 * GET /api/admin/outbound-templates/version-overview
 *
 * Returns all accounts with their outbound agent status, template versions,
 * and agent group enablement for the version overview page.
 */
export async function GET() {
  try {
    await requireAdmin();

    const accounts = await prisma.account.findMany({
      where: { isPersonalAccount: true },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    });

    const allSettings = await prisma.outboundSettings.findMany({
      select: {
        accountId: true,
        patientCareEnabled: true,
        financialEnabled: true,
        patientCareRetellAgentId: true,
        financialRetellAgentId: true,
        outboundTemplateVersion: true,
      },
    });

    const settingsMap = new Map(allSettings.map((s) => [s.accountId, s]));

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

    const versionGroups: Record<string, { version: string; count: number; accountIds: string[] }> = {};
    for (const a of accountOverviews) {
      if (!a.hasOutboundAgent && !a.outboundTemplateVersion) continue;
      const ver = a.outboundTemplateVersion || 'unversioned';
      if (!versionGroups[ver]) {
        versionGroups[ver] = { version: ver, count: 0, accountIds: [] };
      }
      versionGroups[ver]!.count++;
      versionGroups[ver]!.accountIds.push(a.accountId);
    }

    const stats = {
      totalAccounts: accounts.length,
      withOutboundAgent: accountOverviews.filter((a) => a.hasOutboundAgent).length,
      patientCareEnabled: accountOverviews.filter((a) => a.patientCareEnabled).length,
      financialEnabled: accountOverviews.filter((a) => a.financialEnabled).length,
      onLatest: accountOverviews.filter((a) => a.isOnLatest).length,
      uniqueVersions: Object.keys(versionGroups).length,
    };

    return NextResponse.json({
      success: true,
      accounts: accountOverviews,
      versionGroups: Object.values(versionGroups),
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        agentGroup: t.agentGroup,
        version: t.version,
        isActive: t.isActive,
      })),
      latestVersionByGroup,
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get outbound version overview' },
      { status: 500 },
    );
  }
}
