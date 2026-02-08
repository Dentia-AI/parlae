import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/server';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSessionUser();
    
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { templateId, accountIds } = body;

    if (!templateId || !accountIds || !Array.isArray(accountIds)) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    // Fetch template
    const template = await prisma.agentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const vapiService = createVapiService();
    let updatedCount = 0;

    // Update each account
    for (const accountId of accountIds) {
      try {
        // Get account with current settings
        const account = await prisma.account.findUnique({
          where: { id: accountId },
          select: {
            id: true,
            name: true,
            phoneIntegrationSettings: true,
          },
        });

        if (!account) {
          console.warn(`Account ${accountId} not found, skipping`);
          continue;
        }

        const settings = account.phoneIntegrationSettings as any;

        // Only update if agent is already deployed
        if (!settings?.vapiAssistantId || !settings?.vapiSquadId) {
          console.warn(`Account ${accountId} has no deployed agent, skipping`);
          continue;
        }

        // Update Vapi assistant with new template config
        // Preserve: voice, knowledge base, phone number
        const updatedAssistant = await vapiService.updateAssistant(
          settings.vapiAssistantId,
          {
            name: `${account.name} - ${template.displayName}`,
            // Apply template settings
            firstMessage: (template.assistantConfig as any).firstMessage,
            endCallMessage: (template.assistantConfig as any).endCallMessage,
            endCallPhrases: (template.assistantConfig as any).endCallPhrases,
            recordingEnabled: (template.assistantConfig as any).recordingEnabled,
            // Preserve user settings
            voice: settings.voiceConfig,
            model: {
              ...(template.modelConfig as any),
              knowledgeBase: settings.knowledgeBaseFileIds
                ? {
                    provider: 'canonical',
                    topK: 5,
                    fileIds: settings.knowledgeBaseFileIds,
                  }
                : undefined,
            },
          }
        );

        // Update squad if needed
        // (Squad config usually doesn't change much, but can be updated here)

        // Update account with new template reference
        await prisma.account.update({
          where: { id: accountId },
          data: {
            agentTemplateId: templateId,
            phoneIntegrationSettings: {
              ...settings,
              templateVersion: template.version,
              templateName: template.name,
              lastTemplateUpdate: new Date().toISOString(),
            },
          },
        });

        updatedCount++;
      } catch (error) {
        console.error(`Error updating account ${accountId}:`, error);
        // Continue with other accounts
      }
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      total: accountIds.length,
    });
  } catch (error) {
    console.error('Assign template error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to assign template' },
      { status: 500 }
    );
  }
}
