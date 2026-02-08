import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { createVapiService } from '@kit/shared/vapi/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log('[fetch-squad] Route hit');
  
  try {
    // Check authentication
    const session = await getSessionUser();
    
    console.log('[fetch-squad] Session check:', { 
      hasSession: !!session, 
      userId: session?.id,
      adminIds: process.env.ADMIN_USER_IDS
    });
    
    if (!session) {
      console.log('[fetch-squad] No session found');
      return NextResponse.json(
        { error: 'Unauthorized - No session' },
        { status: 401 }
      );
    }
    
    const isAdmin = isAdminUser(session.id);
    console.log('[fetch-squad] isAdmin check:', isAdmin);
    
    if (!isAdmin) {
      console.log('[fetch-squad] User is not admin:', session.id);
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    console.log('[fetch-squad] Authentication passed');
    const body = await request.json();
    const { squadId } = body;

    if (!squadId) {
      return NextResponse.json(
        { error: 'Squad ID is required' },
        { status: 400 }
      );
    }

    const vapiService = createVapiService();

    // Fetch squad details
    const squad = await vapiService.getSquad(squadId);

    if (!squad) {
      return NextResponse.json(
        { error: 'Squad not found' },
        { status: 404 }
      );
    }

    // Fetch assistant details for each member
    const assistantPromises = squad.members.map(async (member: any) => {
      const assistantId = member.assistantId || member.assistant?.id;
      if (assistantId) {
        return await vapiService.getAssistant(assistantId);
      }
      return null;
    });

    const assistants = (await Promise.all(assistantPromises)).filter(Boolean);

    // Extract configuration (excluding user-specific data)
    const squadConfig = {
      name: squad.name,
      members: squad.members.map((member: any) => ({
        assistantId: member.assistantId,
        destination: member.destination,
      })),
    };

    // Use first assistant as template (or combine multiple)
    const primaryAssistant = assistants[0];

    const assistantConfig = primaryAssistant
      ? {
          firstMessage: primaryAssistant.firstMessage,
          endCallMessage: primaryAssistant.endCallMessage,
          endCallPhrases: primaryAssistant.endCallPhrases,
          recordingEnabled: primaryAssistant.recordingEnabled,
          backgroundSound: primaryAssistant.backgroundSound,
          // Exclude: voice, knowledgeBase, serverUrl (user-specific)
        }
      : {};

    const modelConfig = primaryAssistant?.model
      ? {
          provider: primaryAssistant.model.provider,
          model: primaryAssistant.model.model,
          systemPrompt: primaryAssistant.model.systemPrompt,
          temperature: primaryAssistant.model.temperature,
          maxTokens: primaryAssistant.model.maxTokens,
          // Exclude: knowledgeBase.fileIds (user-specific)
        }
      : {};

    const toolsConfig = primaryAssistant?.model?.tools || null;

    return NextResponse.json({
      success: true,
      squad: squadConfig,
      assistant: assistantConfig,
      model: modelConfig,
      tools: toolsConfig,
      assistantCount: assistants.length,
    });
  } catch (error) {
    console.error('Fetch squad error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch squad' },
      { status: 500 }
    );
  }
}
