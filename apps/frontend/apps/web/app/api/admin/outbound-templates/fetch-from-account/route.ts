import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { createRetellService } from '@kit/shared/retell/retell.service';

/**
 * POST /api/admin/outbound-templates/fetch-from-account
 *
 * Fetch the live outbound conversation flow config from a deployed account's
 * Retell agent. Supports fetching PATIENT_CARE or FINANCIAL group.
 *
 * Body: { accountId: string, group: 'PATIENT_CARE' | 'FINANCIAL' }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();
  const funcName = 'OutboundFetchFromAccount';

  try {
    await requireAdmin();

    const { accountId, group } = await request.json();

    if (!accountId || !group || !['PATIENT_CARE', 'FINANCIAL'].includes(group)) {
      return NextResponse.json(
        { error: 'accountId and group (PATIENT_CARE or FINANCIAL) are required' },
        { status: 400 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, name: true, brandingBusinessName: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const settings = await prisma.outboundSettings.findUnique({
      where: { accountId },
    });

    if (!settings) {
      return NextResponse.json(
        { error: 'No outbound settings found for this account' },
        { status: 404 },
      );
    }

    const agentId =
      group === 'PATIENT_CARE'
        ? settings.patientCareRetellAgentId
        : settings.financialRetellAgentId;

    if (!agentId) {
      return NextResponse.json(
        { error: `No ${group} Retell agent deployed for this account` },
        { status: 404 },
      );
    }

    const retell = createRetellService();
    if (!retell.isEnabled()) {
      return NextResponse.json({ error: 'Retell service is not enabled' }, { status: 500 });
    }

    const agent = await retell.getAgent(agentId);
    if (!agent) {
      return NextResponse.json(
        { error: 'Failed to fetch agent from Retell' },
        { status: 502 },
      );
    }

    const agentData = agent as any;
    const conversationFlowId = agentData.response_engine?.conversation_flow_id;

    let flowData: any = null;
    let nodeCount = 0;
    let nodes: string[] = [];

    if (conversationFlowId) {
      const flow = await retell.getConversationFlow(conversationFlowId);
      if (flow) {
        flowData = flow;
        nodes = ((flow as any).nodes || [])
          .filter((n: any) => n.type === 'conversation')
          .map((n: any) => n.id);
        nodeCount = nodes.length;
      }
    }

    const businessName = account.brandingBusinessName || account.name || 'Clinic';

    logger.info(
      { funcName, accountId, group, nodeCount, agentId },
      '[Outbound Fetch] Fetched account outbound agent summary',
    );

    return NextResponse.json({
      success: true,
      accountName: businessName,
      group,
      agentId,
      conversationFlowId,
      nodeCount,
      nodes,
      model: flowData?.model_choice?.model || 'unknown',
      voiceId: agentData.voice_id || 'unknown',
      templateVersion: settings.outboundTemplateVersion || 'unknown',
      flowConfig: flowData || null,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      `[${funcName}] Failed`,
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch outbound config' },
      { status: 500 },
    );
  }
}
