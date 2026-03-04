import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '~/lib/auth/get-session';
import { prisma } from '@kit/prisma';
import {
  createRetellService,
  type RetellAgentConfig,
} from '@kit/shared/retell/retell.service';
import {
  SHARED_RETELL_AGENT_CONFIG,
  RETELL_POST_CALL_ANALYSIS,
} from '@kit/shared/retell/templates/dental-clinic.retell-template';

const DEFAULT_CHANNEL_DEFAULTS: Record<string, string> = {
  recall: 'phone',
  reminder: 'sms',
  followup: 'phone',
  noshow: 'phone',
  treatment_plan: 'phone',
  postop: 'phone',
  reactivation: 'phone',
  survey: 'sms',
  welcome: 'sms',
  payment: 'phone',
  benefits: 'sms',
};

const DEFAULT_FOLLOW_UP_CONFIG = {
  delayDays: 3,
  procedureTypeFilters: ['extraction', 'root_canal', 'implant', 'crown'],
  allVisits: false,
};

const DEFAULT_REACTIVATION_CONFIG = {
  inactiveMonths: 12,
  scanFrequency: 'monthly',
  includeTypes: ['cleaning', 'exam', 'checkup'],
};

const DEFAULT_REMINDER_CONFIG = {
  hoursBeforeAppointment: 24,
};

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

async function getAccountId(userId: string) {
  const account = await prisma.account.findFirst({
    where: { primaryOwnerId: userId, isPersonalAccount: true },
    select: { id: true },
  });
  return account?.id ?? null;
}

async function createOutboundRetellAgent(
  accountId: string,
  group: 'PATIENT_CARE' | 'FINANCIAL',
): Promise<{ agentId: string; conversationFlowId: string; templateVersion: string } | null> {
  const template = await prisma.outboundAgentTemplate.findUnique({
    where: { agentGroup: group },
  });

  if (!template || !template.flowConfig) {
    return null;
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { name: true, brandingBusinessName: true, phoneIntegrationSettings: true },
  });
  const clinicName = account?.brandingBusinessName || account?.name || 'Dental Clinic';

  const retell = createRetellService();
  if (!retell.isEnabled()) {
    console.warn('[Outbound] Retell API key not configured — skipping agent creation');
    return null;
  }

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';

  const integrationSettings = (account?.phoneIntegrationSettings as any) ?? {};
  const retellKbId = integrationSettings.retellKnowledgeBaseId as
    | string
    | undefined;

  // Mirror voice from inbound agent config; fall back to default
  const voiceId: string =
    integrationSettings.voiceConfig?.voiceId || 'retell-Chloe';
  const voiceModel = resolveVoiceModel(voiceId);

  const flowConfig = { ...(template.flowConfig as Record<string, unknown>) };
  if (retellKbId) {
    flowConfig.knowledge_base_ids = [retellKbId];
  }
  const flow = await retell.createConversationFlow(flowConfig as any);
  if (!flow) {
    throw new Error(`Failed to create conversation flow for outbound ${group}`);
  }

  const agentName = `${clinicName} - Outbound ${group === 'PATIENT_CARE' ? 'Patient Care' : 'Financial'} (${template.version})`;

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
      accountId,
      agentGroup: group,
      templateId: template.id,
      templateVersion: template.version,
      deployType: 'outbound_conversation_flow',
    },
  };

  const agent = await retell.createAgent(agentConfig as any);
  if (!agent) {
    try {
      await retell.deleteConversationFlow(flow.conversation_flow_id);
    } catch { /* orphan cleanup best-effort */ }
    throw new Error(`Failed to create Retell agent for outbound ${group}`);
  }

  return {
    agentId: agent.agent_id,
    conversationFlowId: flow.conversation_flow_id,
    templateVersion: template.version,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(userId);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const body = await request.json();
    const { action, group } = body;

    if (action === 'setAutoApprove') {
      const settings = await prisma.outboundSettings.update({
        where: { accountId },
        data: { autoApproveCampaigns: body.value === true },
      });
      return NextResponse.json(settings);
    }

    if (!action || !group || !['enable', 'disable'].includes(action) || !['PATIENT_CARE', 'FINANCIAL'].includes(group)) {
      return NextResponse.json({ error: 'Invalid action or group' }, { status: 400 });
    }

    const field = group === 'PATIENT_CARE' ? 'patientCareEnabled' : 'financialEnabled';
    const agentIdField = group === 'PATIENT_CARE' ? 'patientCareRetellAgentId' : 'financialRetellAgentId';

    if (action === 'disable') {
      const settings = await prisma.outboundSettings.update({
        where: { accountId },
        data: { [field]: false },
      });
      return NextResponse.json(settings);
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { brandingTimezone: true },
    });
    const tz = (account as any)?.brandingTimezone || 'America/New_York';

    const existing = await prisma.outboundSettings.findUnique({
      where: { accountId },
    });
    const existingChannelDefaults = (existing?.channelDefaults as Record<string, string>) || {};

    const mergedChannelDefaults = {
      ...DEFAULT_CHANNEL_DEFAULTS,
      ...existingChannelDefaults,
    };

    const updateData: Record<string, unknown> = {
      [field]: true,
      timezone: tz,
      channelDefaults: mergedChannelDefaults,
    };

    if (group === 'PATIENT_CARE') {
      updateData.followUpConfig = DEFAULT_FOLLOW_UP_CONFIG;
      updateData.reactivationConfig = DEFAULT_REACTIVATION_CONFIG;
      updateData.reminderConfig = DEFAULT_REMINDER_CONFIG;
    }

    const currentAgentId = existing?.[agentIdField as keyof typeof existing] as string | null;
    if (!currentAgentId) {
      try {
        const deployment = await createOutboundRetellAgent(accountId, group as 'PATIENT_CARE' | 'FINANCIAL');
        if (deployment) {
          updateData[agentIdField] = deployment.agentId;
          updateData.outboundTemplateVersion = deployment.templateVersion;

          const prevHistory = (existing?.outboundUpgradeHistory as unknown[]) || [];
          updateData.outboundUpgradeHistory = [
            ...prevHistory,
            {
              version: deployment.templateVersion,
              agentId: deployment.agentId,
              conversationFlowId: deployment.conversationFlowId,
              group,
              action: 'initial_deploy',
              timestamp: new Date().toISOString(),
            },
          ];
        }
      } catch (err) {
        console.error(`[Outbound] Failed to create Retell agent for ${group}:`, err);
      }
    }

    // Auto-set fromPhoneNumberId from inbound phone if not already configured
    if (!existing?.fromPhoneNumberId) {
      const inboundPhone = await prisma.retellPhoneNumber.findFirst({
        where: { accountId, isActive: true },
        select: { id: true },
      });
      if (inboundPhone) {
        updateData.fromPhoneNumberId = inboundPhone.id;
      }
    }

    const settings = await prisma.outboundSettings.upsert({
      where: { accountId },
      update: updateData,
      create: {
        accountId,
        ...updateData,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error updating outbound settings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update settings' },
      { status: 500 },
    );
  }
}
