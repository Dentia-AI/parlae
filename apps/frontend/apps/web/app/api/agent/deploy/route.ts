import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@kit/shared/auth/nextauth';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { executeDeployment } from '../../../home/(user)/agent/setup/_lib/actions';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/agent/deploy
 *
 * Fire-and-forget deployment endpoint. The review page calls this
 * without awaiting the response, so the user is redirected to the
 * overview page immediately while deployment runs in the background.
 *
 * The deployment status is tracked in `phoneIntegrationSettings.deploymentStatus`
 * and polled by the client via `/api/agent/deploy-status`.
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { voice: any; files?: any[]; knowledgeBaseConfig?: Record<string, string[]> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.voice) {
    return NextResponse.json({ error: 'Voice configuration is required' }, { status: 400 });
  }

  const userId = session.user.id;

  const account = await prisma.account.findFirst({
    where: { primaryOwnerId: userId },
    select: {
      id: true,
      phoneIntegrationSettings: true,
      brandingWebsite: true,
      brandingBusinessName: true,
      name: true,
    },
  });

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Mark deployment as in_progress (may already be set by the client action)
  const existingSettings = (account.phoneIntegrationSettings as Record<string, unknown>) || {};
  await prisma.account.update({
    where: { id: account.id },
    data: {
      phoneIntegrationSettings: {
        ...existingSettings,
        deploymentStatus: 'in_progress',
        deploymentStartedAt: new Date().toISOString(),
        deploymentError: null,
      },
    },
  });

  try {
    // Auto-scrape website KB if the user provided a website URL and has no KB files yet
    const settings = (account.phoneIntegrationSettings as Record<string, unknown>) || {};
    const hasExistingKB = body.knowledgeBaseConfig && Object.values(body.knowledgeBaseConfig).some((ids: any) => ids?.length > 0);

    if (account.brandingWebsite && !hasExistingKB && !settings.websiteScrapedAt) {
      logger.info(
        { accountId: account.id, websiteUrl: account.brandingWebsite },
        '[Deploy API] Auto-scraping website for knowledge base',
      );

      try {
        const { scrapeWebsite } = await import('@kit/shared/scraper/website-scraper');
        const { categorizeContent } = await import('@kit/shared/scraper/categorize-content');
        const { getAccountProvider } = await import('@kit/shared/voice-provider');
        const provider = await getAccountProvider(account.id);

        const scrapeResult = await scrapeWebsite(account.brandingWebsite);

        if (scrapeResult.pages.length > 0) {
          const categorizationResult = await categorizeContent(scrapeResult.pages);
          const businessName = account.brandingBusinessName || account.name || 'Clinic';
          const existingConfig: Record<string, string[]> = {};

          if (provider === 'RETELL') {
            // Upload directly to Retell KB
            const { createRetellService } = await import('@kit/shared/retell/retell.service');
            const retellService = createRetellService();

            if (retellService.isEnabled() && categorizationResult.documents.length > 0) {
              const textSnippets = categorizationResult.documents.map((doc) => ({
                title: `${businessName} - ${doc.categoryId}`,
                text: doc.content,
              }));

              const kb = await retellService.createKnowledgeBase({
                name: `kb-${account.id.slice(0, 8)}`,
                texts: textSnippets,
              });

              if (kb) {
                await retellService.waitForKnowledgeBase(kb.knowledge_base_id);

                for (const doc of categorizationResult.documents) {
                  if (!existingConfig[doc.categoryId]) existingConfig[doc.categoryId] = [];
                }

                const freshSettings = (await prisma.account.findUnique({
                  where: { id: account.id },
                  select: { phoneIntegrationSettings: true },
                }))?.phoneIntegrationSettings as Record<string, unknown> || {};

                await prisma.account.update({
                  where: { id: account.id },
                  data: {
                    phoneIntegrationSettings: {
                      ...freshSettings,
                      knowledgeBaseConfig: existingConfig,
                      retellKnowledgeBaseId: kb.knowledge_base_id,
                      websiteScrapedUrl: account.brandingWebsite,
                      websiteScrapedAt: new Date().toISOString(),
                    },
                  },
                });

                logger.info(
                  { accountId: account.id, retellKbId: kb.knowledge_base_id },
                  '[Deploy API] Website KB uploaded to Retell',
                );
              }
            }
          } else {
            // Fallback: Upload to Vapi
            const { createVapiService } = await import('@kit/shared/vapi/server');
            const vapiService = createVapiService();

            for (const doc of categorizationResult.documents) {
              const fileName = `${businessName.replace(/[^a-zA-Z0-9]/g, '-')}-${doc.categoryId}.txt`;
              const fileId = await vapiService.uploadKnowledgeFile({
                name: fileName,
                content: doc.content,
                type: 'text',
              });

              if (fileId) {
                if (!existingConfig[doc.categoryId]) existingConfig[doc.categoryId] = [];
                existingConfig[doc.categoryId]!.push(fileId);
              }
            }

            const allFileIds = Object.values(existingConfig).flat().filter(Boolean);

            if (allFileIds.length > 0) {
              body.knowledgeBaseConfig = existingConfig;

              let queryToolId = (settings as any).queryToolId;
              let queryToolName = (settings as any).queryToolName;

              const toolResult = await vapiService.ensureClinicQueryTool(
                account.id,
                allFileIds,
                (settings as any).templateVersion || 'v2.0',
                businessName,
              );
              if (toolResult) {
                queryToolId = toolResult.toolId;
                queryToolName = toolResult.toolName;
              }

              const freshSettings = (await prisma.account.findUnique({
                where: { id: account.id },
                select: { phoneIntegrationSettings: true },
              }))?.phoneIntegrationSettings as Record<string, unknown> || {};

              await prisma.account.update({
                where: { id: account.id },
                data: {
                  phoneIntegrationSettings: {
                    ...freshSettings,
                    knowledgeBaseConfig: existingConfig,
                    knowledgeBaseFileIds: allFileIds,
                    queryToolId,
                    queryToolName,
                    websiteScrapedUrl: account.brandingWebsite,
                    websiteScrapedAt: new Date().toISOString(),
                  },
                },
              });

              logger.info(
                { accountId: account.id, fileCount: allFileIds.length },
                '[Deploy API] Website KB scrape complete (Vapi)',
              );
            }
          }
        }
      } catch (scrapeErr) {
        logger.warn(
          { error: scrapeErr instanceof Error ? scrapeErr.message : scrapeErr },
          '[Deploy API] Website scrape failed (non-fatal), continuing deployment',
        );
      }
    }

    const result = await executeDeployment(userId, {
      voice: body.voice,
      files: body.files || [],
      knowledgeBaseConfig: body.knowledgeBaseConfig,
    });

    // Read fresh settings (executeDeployment writes vapiSquadId etc.)
    const freshAccount = await prisma.account.findUnique({
      where: { id: account.id },
      select: { phoneIntegrationSettings: true },
    });
    const freshSettings = (freshAccount?.phoneIntegrationSettings as Record<string, unknown>) || {};

    await prisma.account.update({
      where: { id: account.id },
      data: {
        phoneIntegrationSettings: {
          ...freshSettings,
          deploymentStatus: result.success ? 'completed' : 'failed',
          deploymentError: result.success ? null : (result.error || null),
          deploymentCompletedAt: new Date().toISOString(),
        },
      },
    });

    logger.info(
      { accountId: account.id, success: result.success },
      '[Deploy API] Deployment finished',
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error, userId }, '[Deploy API] Deployment failed with exception');

    try {
      const freshAccount = await prisma.account.findUnique({
        where: { id: account.id },
        select: { phoneIntegrationSettings: true },
      });
      const freshSettings = (freshAccount?.phoneIntegrationSettings as Record<string, unknown>) || {};

      await prisma.account.update({
        where: { id: account.id },
        data: {
          phoneIntegrationSettings: {
            ...freshSettings,
            deploymentStatus: 'failed',
            deploymentError: error instanceof Error ? error.message : 'Unknown error',
            deploymentCompletedAt: new Date().toISOString(),
          },
        },
      });
    } catch (statusErr) {
      logger.error({ error: statusErr }, '[Deploy API] Failed to mark deployment as failed');
    }

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Deployment failed' },
      { status: 500 },
    );
  }
}
