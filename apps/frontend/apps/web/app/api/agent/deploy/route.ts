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
  const deployStart = Date.now();

  logger.info('[Deploy API] ▶ Request received');

  const session = await auth();
  if (!session?.user?.id) {
    logger.warn('[Deploy API] Unauthorized — no session');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  logger.info({ userId }, '[Deploy API] Authenticated user');

  let body: { voice: any; files?: any[]; knowledgeBaseConfig?: Record<string, string[]> };
  try {
    body = await request.json();
  } catch {
    logger.error('[Deploy API] Invalid request body');
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.voice) {
    logger.error('[Deploy API] Missing voice configuration in body');
    return NextResponse.json({ error: 'Voice configuration is required' }, { status: 400 });
  }

  logger.info(
    { voiceId: body.voice?.voiceId, voiceName: body.voice?.name },
    '[Deploy API] Deploy payload parsed',
  );

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
    logger.error({ userId }, '[Deploy API] Account not found for user');
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  logger.info({ accountId: account.id, name: account.name }, '[Deploy API] Account found');

  // Mark deployment as in_progress
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

  logger.info({ accountId: account.id }, '[Deploy API] Marked deployment in_progress');

  try {
    // Auto-scrape website KB (non-blocking — failures don't stop deployment)
    const settings = (account.phoneIntegrationSettings as Record<string, unknown>) || {};
    const hasExistingKB = body.knowledgeBaseConfig && Object.values(body.knowledgeBaseConfig).some((ids: any) => ids?.length > 0);

    if (account.brandingWebsite && !hasExistingKB && !settings.websiteScrapedAt) {
      logger.info(
        { accountId: account.id, websiteUrl: account.brandingWebsite },
        '[Deploy API] Auto-scraping website for knowledge base',
      );

      try {
        const scrapeStart = Date.now();
        const { scrapeWebsite } = await import('@kit/shared/scraper/website-scraper');
        const { categorizeContent } = await import('@kit/shared/scraper/categorize-content');
        const { getAccountProvider } = await import('@kit/shared/voice-provider');
        const provider = await getAccountProvider(account.id);

        const scrapeResult = await scrapeWebsite(account.brandingWebsite);
        logger.info(
          { pages: scrapeResult.pages.length, elapsedMs: Date.now() - scrapeStart },
          '[Deploy API] Website scrape finished',
        );

        if (scrapeResult.pages.length > 0) {
          const categorizationResult = await categorizeContent(scrapeResult.pages);
          const businessName = account.brandingBusinessName || account.name || 'Clinic';
          const existingConfig: Record<string, string[]> = {};

          if (provider === 'RETELL') {
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
                // Cap the wait at 30s during deployment — KB can finish processing later
                await retellService.waitForKnowledgeBase(kb.knowledge_base_id, 30_000, 3000);

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

              const toolResult = await vapiService.ensureClinicQueryTool(
                account.id,
                allFileIds,
                (settings as any).templateVersion || 'v2.0',
                businessName,
              );

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
                    queryToolId: toolResult?.toolId,
                    queryToolName: toolResult?.toolName,
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
          { error: scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr) },
          '[Deploy API] Website scrape failed (non-fatal), continuing deployment',
        );
      }
    } else {
      logger.info('[Deploy API] Skipping website scrape (no website or KB already exists)');
    }

    logger.info(
      { accountId: account.id, elapsedMs: Date.now() - deployStart },
      '[Deploy API] ▶ Calling executeDeployment',
    );

    const result = await executeDeployment(userId, {
      voice: body.voice,
      files: body.files || [],
      knowledgeBaseConfig: body.knowledgeBaseConfig,
    });

    // Read fresh settings (executeDeployment writes agent IDs etc.)
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
      { accountId: account.id, success: result.success, elapsedMs: Date.now() - deployStart },
      '[Deploy API] ✅ Deployment finished',
    );

    return NextResponse.json(result);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { error: errMsg, stack: error instanceof Error ? error.stack : undefined, userId, elapsedMs: Date.now() - deployStart },
      '[Deploy API] ❌ Deployment failed with exception',
    );

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
            deploymentError: errMsg,
            deploymentCompletedAt: new Date().toISOString(),
          },
        },
      });
    } catch (statusErr) {
      logger.error({ error: statusErr }, '[Deploy API] Failed to mark deployment as failed');
    }

    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 },
    );
  }
}
