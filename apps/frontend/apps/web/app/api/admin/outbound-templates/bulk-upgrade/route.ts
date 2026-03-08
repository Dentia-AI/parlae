import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import {
  createRetellService,
  type RetellAgentConfig,
} from '@kit/shared/retell/retell.service';
import {
  SHARED_RETELL_AGENT_CONFIG,
  RETELL_POST_CALL_ANALYSIS,
} from '@kit/shared/retell/templates/dental-clinic.retell-template';

function resolveVoiceModel(voiceId: string): string | undefined {
  const prefix = voiceId.split('-')[0]?.toLowerCase();
  switch (prefix) {
    case '11labs':
      return 'eleven_turbo_v2_5';
    case 'cartesia':
      return 'sonic-3';
    case 'minimax':
      return 'speech-02-turbo';
    default:
      return undefined;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { templateId } = await request.json();
    if (!templateId) {
      return NextResponse.json({ error: 'templateId required' }, { status: 400 });
    }

    const template = await prisma.outboundAgentTemplate.findUnique({ where: { id: templateId } });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const retell = createRetellService();
    if (!retell.isEnabled()) {
      return NextResponse.json({ error: 'Retell API key not configured' }, { status: 500 });
    }

    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';

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
      include: {
        account: {
          select: { id: true, name: true, brandingBusinessName: true, phoneIntegrationSettings: true },
        },
      },
    });

    const results: Array<{ accountId: string; status: string; agentId?: string; error?: string }> = [];

    for (const s of settings) {
      try {
        const integrationSettings =
          (s.account?.phoneIntegrationSettings as any) ?? {};
        const retellKbId = integrationSettings.retellKnowledgeBaseId as
          | string
          | undefined;

        const flowConfig = {
          ...(template.flowConfig as Record<string, unknown>),
        };
        if (retellKbId) {
          flowConfig.knowledge_base_ids = [retellKbId];
        }
        const flow = await retell.createConversationFlow(flowConfig as any);
        if (!flow) {
          results.push({ accountId: s.accountId, status: 'failed', error: 'Flow creation failed' });
          continue;
        }

        const clinicName = s.account?.brandingBusinessName || s.account?.name || 'Dental Clinic';
        const groupLabel = template.agentGroup === 'PATIENT_CARE' ? 'Patient Care' : 'Financial';
        const agentName = `${clinicName} - Outbound ${groupLabel} (${template.version})`;

        // Mirror voice from inbound agent config
        const voiceId: string =
          integrationSettings.voiceConfig?.voiceId || 'retell-Chloe';
        const voiceModel = resolveVoiceModel(voiceId);

        const agentConfig: RetellAgentConfig = {
          agent_name: agentName,
          response_engine: {
            type: 'conversation-flow',
            conversation_flow_id: flow.conversation_flow_id,
          },
          voice_id: voiceId,
          ...(voiceModel ? { voice_model: voiceModel } : {}),
          ...SHARED_RETELL_AGENT_CONFIG,
          webhook_url: backendUrl ? `${backendUrl}/retell/webhook` : undefined,
          webhook_events: ['call_started', 'call_ended', 'call_analyzed'],
          post_call_analysis_data: RETELL_POST_CALL_ANALYSIS,
          boosted_keywords: [clinicName, 'appointment', 'dentist', 'dental'],
          metadata: {
            accountId: s.accountId,
            agentGroup: template.agentGroup,
            templateId: template.id,
            templateVersion: template.version,
            deployType: 'outbound_conversation_flow',
            upgradeFrom: (s as any)[agentIdField],
          },
        };

        const agent = await retell.createAgent(agentConfig as any);
        if (!agent) {
          try { await retell.deleteConversationFlow(flow.conversation_flow_id); } catch {}
          results.push({ accountId: s.accountId, status: 'failed', error: 'Agent creation failed' });
          continue;
        }

        // Use phoneIntegrationSettings.phoneNumber as the authoritative phone
        const accountPhone = integrationSettings.phoneNumber as string | undefined;

        const phoneRecord = accountPhone
          ? await prisma.retellPhoneNumber.findFirst({
              where: { phoneNumber: accountPhone, isActive: true },
              select: { phoneNumber: true },
            })
          : await prisma.retellPhoneNumber.findFirst({
              where: { accountId: s.accountId, isActive: true },
              select: { phoneNumber: true },
            });
        if (phoneRecord?.phoneNumber) {
          try {
            await retell.updatePhoneNumber(phoneRecord.phoneNumber, {
              outbound_agent_id: agent.agent_id,
            });
            console.log(
              `[Outbound] Set outbound_agent_id=${agent.agent_id} on phone ${phoneRecord.phoneNumber} (accountPhone=${accountPhone || 'none'}) for account ${s.accountId}`,
            );
          } catch (err) {
            console.warn(
              `[Outbound] Failed to set outbound_agent_id on phone ${phoneRecord.phoneNumber} for account ${s.accountId}:`,
              err instanceof Error ? err.message : err,
            );
          }
        } else {
          console.warn(
            `[Outbound] No active retellPhoneNumber found for account ${s.accountId} (accountPhone=${accountPhone || 'none'}) — outbound agent not attached to any phone`,
          );
        }

        const previousAgentId = (s as any)[agentIdField] as string | null;
        const prevHistory = (s.outboundUpgradeHistory as unknown[]) || [];
        await prisma.outboundSettings.update({
          where: { id: s.id },
          data: {
            [agentIdField]: agent.agent_id,
            outboundTemplateVersion: template.version,
            outboundUpgradeHistory: [
              ...prevHistory,
              {
                version: template.version,
                agentId: agent.agent_id,
                conversationFlowId: flow.conversation_flow_id,
                previousAgentId,
                group: template.agentGroup,
                action: 'bulk_upgrade',
                timestamp: new Date().toISOString(),
              },
            ],
          },
        });

        if (previousAgentId && previousAgentId !== agent.agent_id) {
          try {
            const oldAgent = await retell.getAgent(previousAgentId);
            const oldFlowId = oldAgent?.response_engine?.conversation_flow_id;
            await retell.deleteAgent(previousAgentId);
            if (oldFlowId) {
              await retell.deleteConversationFlow(oldFlowId);
            }
          } catch (cleanupErr) {
            console.warn(
              `[Outbound] Failed to clean up previous agent ${previousAgentId} for account ${s.accountId}:`,
              cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
            );
          }
        }

        results.push({ accountId: s.accountId, status: 'success', agentId: agent.agent_id });
      } catch (err) {
        results.push({
          accountId: s.accountId,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    return NextResponse.json({
      message: `Bulk upgrade complete: ${succeeded} succeeded, ${failed} failed out of ${settings.length} accounts`,
      results,
    });
  } catch (error) {
    console.error('[admin/outbound-templates/bulk-upgrade] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk upgrade failed' },
      { status: 500 },
    );
  }
}
