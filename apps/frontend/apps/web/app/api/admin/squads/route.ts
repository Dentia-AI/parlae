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

    // Fetch all squads from Vapi
    const vapiSquads = await vapiService.listSquads();

    // Fetch all assistants from Vapi
    const vapiAssistants = await vapiService.listAssistants();

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
      members: (squad.members || []).map((m: any) => ({
        assistantId: m.assistantId,
        assistantName:
          m.assistant?.name ||
          vapiAssistants.find((a: any) => a.id === m.assistantId)?.name ||
          'Unknown',
        hasTools: !!(
          m.assistant?.tools?.length ||
          vapiAssistants.find((a: any) => a.id === m.assistantId)?.tools
            ?.length
        ),
        toolCount:
          m.assistant?.tools?.length ||
          vapiAssistants.find((a: any) => a.id === m.assistantId)?.tools
            ?.length ||
          0,
        serverUrl:
          m.assistant?.serverUrl ||
          vapiAssistants.find((a: any) => a.id === m.assistantId)
            ?.serverUrl,
        hasAnalysisPlan: !!(
          m.assistant?.analysisPlan ||
          vapiAssistants.find((a: any) => a.id === m.assistantId)
            ?.analysisPlan
        ),
      })),
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
      .map((a: any) => ({
        id: a.id,
        name: a.name,
        createdAt: a.createdAt,
        hasTools: !!(a.tools?.length),
        toolCount: a.tools?.length || 0,
        serverUrl: a.serverUrl,
      }));

    return NextResponse.json({
      squads,
      orphanedAssistants,
      totalSquads: squads.length,
      totalAssistants: vapiAssistants.length,
      totalOrphaned: orphanedAssistants.length,
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
