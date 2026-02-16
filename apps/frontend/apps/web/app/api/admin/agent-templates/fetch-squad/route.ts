import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { createVapiService } from '@kit/shared/vapi/server';
import { getLogger } from '@kit/shared/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/agent-templates/fetch-squad
 *
 * Pulls a live squad configuration from Vapi and converts it into the shape
 * needed to create/update an AgentTemplate in our DB.
 *
 * Body: { squadId: string }
 *
 * The returned data includes ALL assistants with their full configurations
 * (prompts, tools, voice, model settings, routing destinations) so it can
 * be saved as a complete template.
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    const session = await getSessionUser();

    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { squadId } = body;

    if (!squadId) {
      return NextResponse.json(
        { error: 'Squad ID is required' },
        { status: 400 },
      );
    }

    const vapiService = createVapiService();

    // Fetch squad details
    const squad = await vapiService.getSquad(squadId);

    if (!squad) {
      return NextResponse.json(
        { error: 'Squad not found in Vapi' },
        { status: 404 },
      );
    }

    logger.info(
      { squadId, memberCount: squad.members?.length },
      '[Fetch Squad] Retrieved squad from Vapi',
    );

    // Fetch full assistant details for each member
    const members: any[] = [];

    for (const member of squad.members || []) {
      const assistantId = member.assistantId || member.assistant?.id;
      let assistant: any = null;

      if (assistantId) {
        assistant = await vapiService.getAssistant(assistantId);
      } else if (member.assistant) {
        // Inline assistant definition (shouldn't happen with our flow, but handle it)
        assistant = member.assistant;
      }

      if (!assistant) {
        logger.warn(
          { assistantId, memberIndex: members.length },
          '[Fetch Squad] Could not fetch assistant for member',
        );
        continue;
      }

      // Extract assistant destinations from squad member
      const assistantDestinations = (member.assistantDestinations || []).map(
        (d: any) => ({
          type: d.type || 'assistant',
          assistantName: d.assistantName,
          description: d.description || '',
        }),
      );

      // Extract tools — separate function tools from transferCall/endCall
      const modelTools = assistant.model?.tools || [];
      const functionTools = modelTools.filter(
        (t: any) => t.type === 'function',
      );
      const transferCallTools = modelTools.filter(
        (t: any) => t.type === 'transferCall',
      );
      const endCallTools = modelTools.filter(
        (t: any) => t.type === 'endCall',
      );

      // Determine tool group by matching known patterns
      let toolGroup = 'none';
      const toolNames = functionTools.map((t: any) => t.function?.name || '');
      if (toolNames.includes('bookAppointment') && toolNames.includes('searchPatients')) {
        if (toolNames.includes('rescheduleAppointment')) {
          toolGroup = 'scheduling';
        } else {
          toolGroup = 'emergency';
        }
      } else if (toolNames.includes('getPatientInsurance') || toolNames.includes('getProviders')) {
        toolGroup = 'clinicInfo';
      }

      // Reconstruct the system prompt from model messages
      const systemMessage = assistant.model?.messages?.find(
        (m: any) => m.role === 'system',
      );
      const systemPrompt =
        systemMessage?.content || assistant.model?.systemPrompt || '';

      // Map voice provider back from Vapi format
      let voiceProvider = assistant.voice?.provider || 'openai';
      if (voiceProvider === '11labs') voiceProvider = 'elevenlabs';

      members.push({
        assistant: {
          name: assistant.name || `Assistant ${members.length + 1}`,
          systemPrompt,
          firstMessage: assistant.firstMessage ?? '',
          firstMessageMode:
            assistant.firstMessageMode ||
            'assistant-speaks-first-with-model-generated-message',
          voice: {
            provider: voiceProvider,
            voiceId: assistant.voice?.voiceId || '',
          },
          model: {
            provider: assistant.model?.provider || 'openai',
            model: assistant.model?.model || 'gpt-4o',
            temperature: assistant.model?.temperature ?? 0.7,
            maxTokens: assistant.model?.maxTokens ?? 500,
          },
          recordingEnabled: assistant.recordingEnabled ?? true,
          startSpeakingPlan: assistant.startSpeakingPlan || {
            waitSeconds: 0.4,
            smartEndpointingPlan: { provider: 'livekit' },
          },
          stopSpeakingPlan: assistant.stopSpeakingPlan || {
            numWords: 0,
            voiceSeconds: 0.2,
            backoffSeconds: 1,
          },
          toolGroup,
          extraTools: transferCallTools.length > 0 ? transferCallTools : undefined,
          analysisSchema: assistant.analysisPlan?.structuredDataSchema || undefined,
        },
        assistantDestinations,
      });
    }

    // Build the DB-compatible shapes
    const squadConfig = {
      memberCount: members.length,
      memberNames: members.map((m) => m.assistant.name),
      destinations: members.map((m) => ({
        name: m.assistant.name,
        destinations: m.assistantDestinations.map(
          (d: any) => d.assistantName,
        ),
      })),
    };

    const assistantConfig = {
      members: members.map((m) => ({
        name: m.assistant.name,
        firstMessage: m.assistant.firstMessage,
        firstMessageMode: m.assistant.firstMessageMode,
        systemPrompt: m.assistant.systemPrompt,
        recordingEnabled: m.assistant.recordingEnabled,
        startSpeakingPlan: m.assistant.startSpeakingPlan,
        stopSpeakingPlan: m.assistant.stopSpeakingPlan,
        analysisSchema: m.assistant.analysisSchema,
        extraTools: m.assistant.extraTools,
      })),
    };

    const modelConfig = {
      members: members.map((m) => ({
        provider: m.assistant.model.provider,
        model: m.assistant.model.model,
        temperature: m.assistant.model.temperature,
        maxTokens: m.assistant.model.maxTokens,
      })),
    };

    const toolsConfig = {
      groups: members.reduce(
        (acc: Record<string, string>, m: any) => {
          acc[m.assistant.name] = m.assistant.toolGroup;
          return acc;
        },
        {} as Record<string, string>,
      ),
    };

    // Also return the raw member data for preview
    const preview = members.map((m) => ({
      name: m.assistant.name,
      toolGroup: m.assistant.toolGroup,
      toolCount:
        (m.assistant.toolGroup !== 'none' ? '(group)' : '0') +
        (m.assistant.extraTools?.length ? ` + ${m.assistant.extraTools.length} extra` : ''),
      destinations: m.assistantDestinations.map((d: any) => d.assistantName),
      voiceProvider: m.assistant.voice.provider,
      voiceId: m.assistant.voice.voiceId,
      model: m.assistant.model.model,
      hasAnalysisSchema: !!m.assistant.analysisSchema,
      promptLength: m.assistant.systemPrompt.length,
    }));

    logger.info(
      {
        squadId,
        memberCount: members.length,
        memberNames: members.map((m: any) => m.assistant.name),
      },
      '[Fetch Squad] Successfully extracted template config',
    );

    return NextResponse.json({
      success: true,
      squadId,
      squadName: squad.name || 'Unnamed Squad',
      assistantCount: members.length,
      preview,
      // DB-compatible shapes for AgentTemplate creation
      squadConfig,
      assistantConfig,
      modelConfig,
      toolsConfig,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      '[Fetch Squad] Failed',
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to fetch squad',
      },
      { status: 500 },
    );
  }
}
