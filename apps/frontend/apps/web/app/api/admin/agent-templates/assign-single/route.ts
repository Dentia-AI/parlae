import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/server';

export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { templateId, accountId } = body;

    if (!templateId || !accountId) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Fetch template
    const template = await prisma.agentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    // Fetch account with current settings
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        phoneIntegrationSettings: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    const settings = account.phoneIntegrationSettings as any;
    const assistantId = settings?.vapiAssistantId;

    if (!assistantId) {
      return NextResponse.json(
        { success: false, error: 'Account has no Vapi assistant configured' },
        { status: 400 }
      );
    }

    // Update Vapi assistant with template settings while preserving user settings
    const vapiService = createVapiService();
    const assistantConfig = template.assistantConfig as any;
    const modelConfig = template.modelConfig as any;
    const toolsConfig = template.toolsConfig as any;

    const updatePayload: any = {
      name: `${account.name} - ${assistantConfig.name}`,
      // Preserve voice from existing settings
      voice: settings.vapiVoice || assistantConfig.voice,
      model: modelConfig,
      // Preserve knowledge base from existing settings
      ...(settings.vapiKnowledgeBase ? { knowledgeBase: settings.vapiKnowledgeBase } : {}),
      firstMessage: assistantConfig.firstMessage,
      systemPrompt: assistantConfig.systemPrompt,
      ...(toolsConfig ? { toolIds: toolsConfig } : {}),
    };

    await vapiService.updateAssistant(assistantId, updatePayload);

    // Update account with template info
    await prisma.account.update({
      where: { id: accountId },
      data: {
        agentTemplateId: templateId,
        phoneIntegrationSettings: {
          ...(settings || {}),
          templateVersion: template.version,
          templateName: template.name,
          lastTemplateUpdate: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Template assigned successfully',
      account: {
        id: accountId,
        name: account.name,
        template: {
          id: template.id,
          name: template.name,
          displayName: template.displayName,
          version: template.version,
        },
      },
    });
  } catch (error) {
    console.error('[assign-single] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to assign template',
      },
      { status: 500 }
    );
  }
}
