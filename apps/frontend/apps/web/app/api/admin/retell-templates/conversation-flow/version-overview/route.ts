import { NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';

/**
 * GET /api/admin/retell-templates/conversation-flow/version-overview
 *
 * Returns all accounts with their conversation flow template version,
 * grouped by version for overview.
 */
export async function GET() {
  try {
    await requireAdmin();

    const accounts = await prisma.account.findMany({
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
    });

    const templates = await prisma.retellConversationFlowTemplate.findMany({
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

    const accountOverviews = accounts.map((account) => {
      const settings = account.phoneIntegrationSettings as any;
      const hasFlowAgent = !!settings?.conversationFlowId;

      return {
        accountId: account.id,
        accountName: account.name,
        accountEmail: account.email,
        templateId: account.retellFlowTemplateId,
        templateName: account.retellFlowTemplate?.name || null,
        templateDisplayName: account.retellFlowTemplate?.displayName || null,
        templateVersion: account.retellFlowTemplate?.version || null,
        hasFlowAgent,
        conversationFlowId: settings?.conversationFlowId || null,
        agentId: settings?.retellReceptionistAgentId || null,
        isOnLatestDefault: defaultTemplate
          ? account.retellFlowTemplateId === defaultTemplate.id
          : false,
      };
    });

    const versionGroups: Record<
      string,
      { version: string; templateName: string; count: number; accountIds: string[] }
    > = {};

    for (const overview of accountOverviews) {
      if (!overview.hasFlowAgent && !overview.templateId) continue;

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
        withFlowAgent: accountOverviews.filter((a) => a.hasFlowAgent).length,
        withoutFlowAgent: accountOverviews.filter((a) => !a.hasFlowAgent).length,
        withTemplate: accountOverviews.filter((a) => a.templateId).length,
        onLatestDefault: accountOverviews.filter((a) => a.isOnLatestDefault).length,
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
