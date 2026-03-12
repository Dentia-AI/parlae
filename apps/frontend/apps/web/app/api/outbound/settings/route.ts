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
  ALLOWED_OUTBOUND_COUNTRIES,
} from '@kit/shared/retell/templates/dental-clinic.retell-template';
import { buildPatientCareOutboundFlow } from '@kit/shared/retell/templates/outbound/patient-care.flow-template';
import { buildFinancialOutboundFlow } from '@kit/shared/retell/templates/outbound/financial.flow-template';

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

const REVERSE_KEY_MAP: Record<string, string> = {
  patientCareEnabled: 'outbound-patient-care',
  financialEnabled: 'outbound-financial',
  autoApproveCampaigns: 'outbound-auto-approve',
};

async function syncToFeatureSettings(accountId: string, changes: Record<string, boolean>) {
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { featureSettings: true },
    });
    const current = (account?.featureSettings as Record<string, boolean>) ?? {};
    for (const [dbField, value] of Object.entries(changes)) {
      const featureKey = REVERSE_KEY_MAP[dbField];
      if (featureKey) current[featureKey] = value;
    }
    const patientCare = current['outbound-patient-care'] ?? false;
    const financial = current['outbound-financial'] ?? false;
    current['outbound-calls'] = patientCare || financial;
    await prisma.account.update({
      where: { id: accountId },
      data: { featureSettings: current },
    });
  } catch {
    // best-effort sync
  }
}

async function createOutboundRetellAgent(
  accountId: string,
  group: 'PATIENT_CARE' | 'FINANCIAL',
): Promise<{ agentId: string; conversationFlowId: string; templateVersion: string } | null> {
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
  const webhookSecret = process.env.RETELL_WEBHOOK_SECRET || process.env.BACKEND_WEBHOOK_SECRET || '';

  const integrationSettings = (account?.phoneIntegrationSettings as any) ?? {};
  const clinicPhone = integrationSettings.phoneNumber as string || '';

  const voiceId: string =
    integrationSettings.voiceConfig?.voiceId || 'retell-Chloe';
  const voiceModel = resolveVoiceModel(voiceId);

  const retellKbId = integrationSettings.retellKnowledgeBaseId as string | undefined;

  const buildConfig = {
    clinicName,
    clinicPhone,
    webhookUrl: backendUrl ? `${backendUrl}/retell/webhook` : '',
    webhookSecret,
    accountId,
    knowledgeBaseIds: retellKbId ? [retellKbId] : undefined,
  };

  const flowConfig = group === 'PATIENT_CARE'
    ? buildPatientCareOutboundFlow(buildConfig)
    : buildFinancialOutboundFlow(buildConfig);

  const template = await prisma.outboundAgentTemplate.findUnique({
    where: { agentGroup: group },
    select: { id: true, version: true },
  });
  const templateVersion = template?.version || (group === 'PATIENT_CARE' ? 'ob-pc-v1.0' : 'ob-fin-v1.0');

  const flow = await retell.createConversationFlow(flowConfig as any);
  if (!flow) {
    throw new Error(`Failed to create conversation flow for outbound ${group}`);
  }

  const agentName = `${clinicName} - Outbound ${group === 'PATIENT_CARE' ? 'Patient Care' : 'Financial'} (${templateVersion})`;

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
      templateId: template?.id || group,
      templateVersion,
      deployType: 'outbound_conversation_flow',
      knowledgeBaseIds: retellKbId || '',
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
    templateVersion,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    let accountId: string | null = null;
    if (body.accountId) {
      const { isAdminUser } = await import('~/lib/auth/admin');
      if (!(await isAdminUser(userId))) {
        return NextResponse.json({ error: 'Only admins can specify accountId' }, { status: 403 });
      }
      const target = await prisma.account.findUnique({
        where: { id: body.accountId },
        select: { id: true },
      });
      if (!target) return NextResponse.json({ error: 'Target account not found' }, { status: 404 });
      accountId = target.id;
    } else {
      accountId = await getAccountId(userId);
    }
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    const { action, group } = body;

    if (action === 'setAutoApprove') {
      try {
        const settings = await prisma.outboundSettings.update({
          where: { accountId },
          data: { autoApproveCampaigns: body.value === true },
        });
        await syncToFeatureSettings(accountId, { autoApproveCampaigns: body.value === true });
        return NextResponse.json(settings);
      } catch (err: any) {
        if (err?.message?.includes('auto_approve_campaigns')) {
          return NextResponse.json(
            { error: 'Auto-approve feature requires a database migration. Please contact support.' },
            { status: 501 },
          );
        }
        throw err;
      }
    }

    if (action === 'setChannelDefaults') {
      const VALID_CHANNELS = ['none', 'phone', 'sms', 'email'];
      const incoming = body.channelDefaults;
      if (!incoming || typeof incoming !== 'object') {
        return NextResponse.json({ error: 'Invalid channelDefaults' }, { status: 400 });
      }
      const sanitized: Record<string, string> = {};
      for (const [key, val] of Object.entries(incoming)) {
        if (typeof val === 'string' && VALID_CHANNELS.includes(val)) {
          sanitized[key] = val;
        }
      }
      const existing = await prisma.outboundSettings.findUnique({
        where: { accountId },
        select: { channelDefaults: true },
      });
      const merged = {
        ...((existing?.channelDefaults as Record<string, string>) || {}),
        ...sanitized,
      };
      const settings = await prisma.outboundSettings.update({
        where: { accountId },
        data: { channelDefaults: merged },
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
      await syncToFeatureSettings(accountId, { [field]: false });
      return NextResponse.json(settings);
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { brandingTimezone: true },
    });
    const tz = (account as any)?.brandingTimezone || 'America/New_York';

    const existing = await prisma.outboundSettings.findUnique({
      where: { accountId },
      select: {
        patientCareEnabled: true,
        financialEnabled: true,
        patientCareRetellAgentId: true,
        financialRetellAgentId: true,
        channelDefaults: true,
        fromPhoneNumberId: true,
        outboundUpgradeHistory: true,
        outboundTemplateVersion: true,
      },
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
        return NextResponse.json(
          { error: `Failed to deploy outbound agent for ${group === 'PATIENT_CARE' ? 'Patient Care' : 'Financial'}. Please try again later.` },
          { status: 500 },
        );
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

    // Always register the outbound agent on the Retell phone number
    const outboundAgentId = (updateData[agentIdField] ?? currentAgentId) as string | undefined;
    if (outboundAgentId) {
      const phoneRecord = await prisma.retellPhoneNumber.findFirst({
        where: { accountId, isActive: true },
        select: { phoneNumber: true },
      });
      if (phoneRecord?.phoneNumber) {
        try {
          const retell = createRetellService();
          await retell.updatePhoneNumber(phoneRecord.phoneNumber, {
            outbound_agent_id: outboundAgentId,
            allowed_outbound_country_list: ALLOWED_OUTBOUND_COUNTRIES,
          });
          console.log(`[Outbound] Set outbound_agent_id=${outboundAgentId} and allowed countries on phone ${phoneRecord.phoneNumber} for account ${accountId}`);
        } catch (err) {
          console.warn(`[Outbound] Failed to set outbound_agent_id on phone ${phoneRecord.phoneNumber} for account ${accountId}:`, err);
        }
      } else {
        console.warn(`[Outbound] No active retellPhoneNumber found for account ${accountId} — outbound agent not attached to any phone`);
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

    await syncToFeatureSettings(accountId, { [field]: true });

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
