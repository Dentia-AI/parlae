import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireAdmin } from '~/lib/auth/is-admin';
import { createVapiService } from '@kit/shared/vapi/server';
import { getLogger } from '@kit/shared/logger';

/**
 * GET /api/admin/squads
 *
 * List all squads from Vapi + account associations from our DB.
 */
export async function GET() {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const vapiService = createVapiService();
    if (!vapiService.isEnabled()) {
      return NextResponse.json(
        { error: 'Vapi integration not configured' },
        { status: 500 },
      );
    }

    // Fetch all squads, assistants, and standalone tools from Vapi
    const [vapiSquads, vapiAssistants, vapiTools] = await Promise.all([
      vapiService.listSquads(),
      vapiService.listAssistants(),
      vapiService.listTools(),
    ]);

    // Build a tool ID → tool name map for resolving toolIds references
    const toolNameMap = new Map<string, string>();
    for (const tool of vapiTools) {
      if (tool.id) {
        toolNameMap.set(tool.id, tool.function?.name || tool.type || 'unknown');
      }
    }

    // Fetch accounts that have squads linked
    const accounts = await prisma.account.findMany({
      where: {
        phoneIntegrationSettings: { not: null },
      },
      select: {
        id: true,
        name: true,
        email: true,
        brandingBusinessName: true,
        phoneIntegrationSettings: true,
        agentTemplateId: true,
      },
    });

    // Build a map of squadId → account
    const squadAccountMap: Record<string, any> = {};
    for (const account of accounts) {
      const settings = account.phoneIntegrationSettings as any;
      if (settings?.vapiSquadId) {
        squadAccountMap[settings.vapiSquadId] = {
          accountId: account.id,
          accountName:
            account.brandingBusinessName || account.name || account.email,
          templateVersion: settings.templateVersion,
          templateName: settings.templateName,
          phoneNumber: settings.phoneNumber,
        };
      }
    }

    // Merge Vapi squads with account info
    const squads = vapiSquads.map((squad: any) => ({
      id: squad.id,
      name: squad.name,
      createdAt: squad.createdAt,
      updatedAt: squad.updatedAt,
      memberCount: squad.members?.length || 0,
      members: (squad.members || []).map((m: any) => {
        const fullAssistant = vapiAssistants.find((a: any) => a.id === m.assistantId);
        const assistant = fullAssistant || m.assistant;
        const model = assistant?.model || {};

        // Inline tools (transferCall, endCall, or legacy function tools)
        const inlineTools: any[] = model.tools || [];
        // Standalone tool references
        const standaloneToolIds: string[] = model.toolIds || [];

        const inlineToolNames = inlineTools
          .map((t: any) => t.function?.name || t.type)
          .slice(0, 20);
        const standaloneToolNames = standaloneToolIds
          .map((id: string) => toolNameMap.get(id) || `tool:${id.slice(0, 8)}`)
          .slice(0, 20);

        const allToolNames = [...standaloneToolNames, ...inlineToolNames];
        const totalTools = standaloneToolIds.length + inlineTools.length;

        return {
          assistantId: m.assistantId,
          assistantName: assistant?.name || 'Unknown',
          hasTools: totalTools > 0,
          toolCount: totalTools,
          standaloneToolCount: standaloneToolIds.length,
          inlineToolCount: inlineTools.length,
          toolNames: allToolNames,
          standaloneToolIds,
          serverUrl: assistant?.serverUrl,
          hasAnalysisPlan: !!(assistant?.analysisPlan),
        };
      }),
      account: squadAccountMap[squad.id] || null,
    }));

    // Also list orphaned assistants (not in any squad)
    const squadAssistantIds = new Set<string>();
    for (const squad of vapiSquads) {
      for (const member of squad.members || []) {
        if (member.assistantId) squadAssistantIds.add(member.assistantId);
      }
    }

    const orphanedAssistants = vapiAssistants
      .filter((a: any) => !squadAssistantIds.has(a.id))
      .map((a: any) => {
        const model = a.model || {};
        const inlineTools: any[] = model.tools || [];
        const standaloneToolIds: string[] = model.toolIds || [];

        const inlineToolNames = inlineTools.map((t: any) => t.function?.name || t.type);
        const standaloneToolNames = standaloneToolIds
          .map((id: string) => toolNameMap.get(id) || `tool:${id.slice(0, 8)}`);

        return {
          id: a.id,
          name: a.name,
          createdAt: a.createdAt,
          hasTools: (standaloneToolIds.length + inlineTools.length) > 0,
          toolCount: standaloneToolIds.length + inlineTools.length,
          standaloneToolCount: standaloneToolIds.length,
          inlineToolCount: inlineTools.length,
          toolNames: [...standaloneToolNames, ...inlineToolNames].slice(0, 20),
          serverUrl: a.serverUrl,
        };
      });

    // Summarize standalone tools
    const standaloneTools = vapiTools
      .filter((t: any) => t.type === 'function')
      .map((t: any) => ({
        id: t.id,
        name: t.function?.name || 'unnamed',
        description: t.function?.description || '',
        serverUrl: t.server?.url || '',
        createdAt: t.createdAt,
      }));

    // Find orphaned accounts — have phoneIntegrationSettings but no matching
    // Vapi squad. These appear when squad recreation fails after deletion.
    const activeSquadIds = new Set(vapiSquads.map((s: any) => s.id));
    const orphanedAccounts = accounts
      .filter((a) => {
        const settings = a.phoneIntegrationSettings as any;
        if (!settings) return false;
        const squadId = settings.vapiSquadId;
        // Orphaned if: no squadId at all, or the squadId no longer exists in Vapi
        return !squadId || !activeSquadIds.has(squadId);
      })
      .map((a) => {
        const settings = a.phoneIntegrationSettings as any;
        return {
          accountId: a.id,
          accountName: a.brandingBusinessName || a.name || a.email,
          templateVersion: settings?.templateVersion,
          templateName: settings?.templateName,
          phoneNumber: settings?.phoneNumber,
          deletedSquadId: settings?.deletedSquadId || settings?.vapiSquadId,
          lastRedeployedAt: settings?.lastRedeployedAt,
        };
      });

    return NextResponse.json({
      squads,
      orphanedAssistants,
      orphanedAccounts,
      standaloneTools,
      totalSquads: squads.length,
      totalAssistants: vapiAssistants.length,
      totalOrphaned: orphanedAssistants.length,
      totalOrphanedAccounts: orphanedAccounts.length,
      totalStandaloneTools: standaloneTools.length,
    });
  } catch (error: any) {
    logger.error(
      { error: error?.message },
      '[Admin Squads] Failed to list squads',
    );
    return NextResponse.json(
      { error: error?.message || 'Failed to list squads' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/squads
 *
 * Delete a squad and optionally its assistants from Vapi.
 *
 * Body:
 * {
 *   squadId: string
 *   deleteAssistants?: boolean  // Also delete standalone assistants (default: false)
 *   assistantIds?: string[]     // Specific assistants to delete
 * }
 */
export async function DELETE(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const body = await request.json();
    const { squadId, deleteAssistants = false, assistantIds = [] } = body;

    if (!squadId && assistantIds.length === 0) {
      return NextResponse.json(
        { error: 'squadId or assistantIds required' },
        { status: 400 },
      );
    }

    const vapiService = createVapiService();
    const results: any = { deleted: [], failed: [] };

    // Delete the squad
    if (squadId) {
      // Optionally get squad details to find assistant IDs
      let memberAssistantIds: string[] = [];
      if (deleteAssistants) {
        const squad = await vapiService.getSquad(squadId);
        memberAssistantIds =
          squad?.members
            ?.map((m: any) => m.assistantId)
            .filter(Boolean) || [];
      }

      const deleted = await vapiService.deleteSquad(squadId);
      if (deleted) {
        results.deleted.push({ type: 'squad', id: squadId });
        logger.info({ squadId }, '[Admin Squads] Deleted squad');
      } else {
        results.failed.push({ type: 'squad', id: squadId });
      }

      // Delete member assistants
      if (deleteAssistants && memberAssistantIds.length > 0) {
        for (const aId of memberAssistantIds) {
          const ok = await vapiService.deleteAssistant(aId);
          if (ok) {
            results.deleted.push({ type: 'assistant', id: aId });
          } else {
            results.failed.push({ type: 'assistant', id: aId });
          }
        }
      }

      // Clear the squad from any linked accounts
      try {
        const accounts = await prisma.account.findMany({
          where: { phoneIntegrationSettings: { path: ['vapiSquadId'], equals: squadId } },
          select: { id: true, phoneIntegrationSettings: true },
        });

        for (const account of accounts) {
          const settings = account.phoneIntegrationSettings as any;
          await prisma.account.update({
            where: { id: account.id },
            data: {
              phoneIntegrationSettings: {
                ...settings,
                vapiSquadId: null,
                deletedSquadId: squadId,
                deletedAt: new Date().toISOString(),
              },
            },
          });
        }
      } catch (dbErr) {
        logger.warn({ dbErr }, '[Admin Squads] Could not clear account links');
      }
    }

    // Delete specific assistants
    for (const aId of assistantIds) {
      const ok = await vapiService.deleteAssistant(aId);
      if (ok) {
        results.deleted.push({ type: 'assistant', id: aId });
      } else {
        results.failed.push({ type: 'assistant', id: aId });
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error: any) {
    logger.error(
      { error: error?.message },
      '[Admin Squads] Failed to delete',
    );
    return NextResponse.json(
      { error: error?.message || 'Failed to delete' },
      { status: 500 },
    );
  }
}
