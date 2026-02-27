import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { templateId, targetVersion } = await request.json();
    if (!templateId || !targetVersion) {
      return NextResponse.json({ error: 'templateId and targetVersion required' }, { status: 400 });
    }

    const template = await prisma.outboundAgentTemplate.findUnique({ where: { id: templateId } });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const agentIdField =
      template.agentGroup === 'PATIENT_CARE'
        ? 'patientCareRetellAgentId'
        : 'financialRetellAgentId';

    const enabledField =
      template.agentGroup === 'PATIENT_CARE'
        ? 'patientCareEnabled'
        : 'financialEnabled';

    const settings = await prisma.outboundSettings.findMany({
      where: {
        [enabledField]: true,
        [agentIdField]: { not: null },
      },
    });

    let rolledBack = 0;
    let skipped = 0;

    for (const s of settings) {
      const history = (s.outboundUpgradeHistory as Array<{
        version: string;
        agentId: string;
        conversationFlowId?: string;
        group: string;
        action: string;
        timestamp: string;
      }>) || [];

      const matchingEntry = [...history]
        .reverse()
        .find(
          (h) =>
            h.version === targetVersion &&
            h.group === template.agentGroup &&
            h.agentId,
        );

      if (!matchingEntry) {
        skipped++;
        continue;
      }

      await prisma.outboundSettings.update({
        where: { id: s.id },
        data: {
          [agentIdField]: matchingEntry.agentId,
          outboundTemplateVersion: targetVersion,
          outboundUpgradeHistory: [
            ...history,
            {
              version: targetVersion,
              agentId: matchingEntry.agentId,
              conversationFlowId: matchingEntry.conversationFlowId,
              previousAgentId: (s as any)[agentIdField],
              group: template.agentGroup,
              action: 'rollback',
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });
      rolledBack++;
    }

    return NextResponse.json({
      message: `Rollback to ${targetVersion}: ${rolledBack} rolled back, ${skipped} skipped (no matching history)`,
      rolledBack,
      skipped,
      total: settings.length,
    });
  } catch (error) {
    console.error('[admin/outbound-templates/rollback] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Rollback failed' },
      { status: 500 },
    );
  }
}
