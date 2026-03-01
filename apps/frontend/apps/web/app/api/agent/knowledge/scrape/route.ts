import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';
import { isAdmin } from '~/lib/auth/is-admin';
import { getLogger } from '@kit/shared/logger';
import { getAccountProvider } from '@kit/shared/voice-provider';
import { scrapeWebsite } from '@kit/shared/scraper/website-scraper';
import {
  categorizeContent,
  KB_CATEGORIES,
} from '@kit/shared/scraper/categorize-content';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/agent/knowledge/scrape
 *
 * Scrapes a website, categorises the content into 6 KB categories using AI,
 * uploads each category document to Vapi as a text file, and optionally syncs
 * to Retell.
 *
 * Body:
 * {
 *   websiteUrl: string        // Required — the clinic website to scrape
 *   accountId?: string        // Optional — admin-only, scrape on behalf of an account
 * }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();
  const funcName = 'POST /api/agent/knowledge/scrape';

  try {
    const session = await requireSession();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { websiteUrl, accountId: requestedAccountId } = body;

    if (!websiteUrl || typeof websiteUrl !== 'string') {
      return NextResponse.json(
        { error: 'websiteUrl is required' },
        { status: 400 },
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(websiteUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL. Please provide a valid http/https URL.' },
        { status: 400 },
      );
    }

    // Determine which account to use
    let accountId: string;
    if (requestedAccountId) {
      const adminUser = await isAdmin();
      if (!adminUser) {
        return NextResponse.json(
          { error: 'Only admins can scrape on behalf of another account' },
          { status: 403 },
        );
      }
      accountId = requestedAccountId;
    } else {
      const personalAccount = await prisma.account.findFirst({
        where: { primaryOwnerId: userId, isPersonalAccount: true },
        select: { id: true },
      });
      if (!personalAccount) {
        return NextResponse.json(
          { error: 'Account not found' },
          { status: 404 },
        );
      }
      accountId = personalAccount.id;
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        brandingBusinessName: true,
        phoneIntegrationSettings: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 },
      );
    }

    const businessName =
      account.brandingBusinessName || account.name || 'Clinic';

    logger.info(
      { funcName, accountId, websiteUrl: parsedUrl.href, businessName },
      '[KB Scrape] Starting website scrape',
    );

    // 1. Scrape the website
    const scrapeResult = await scrapeWebsite(parsedUrl.href);

    if (scrapeResult.pages.length === 0) {
      return NextResponse.json(
        {
          error:
            'No content could be extracted from the website. The site may be JavaScript-rendered or block automated access.',
        },
        { status: 422 },
      );
    }

    logger.info(
      {
        funcName,
        accountId,
        pagesScraped: scrapeResult.scrapedCount,
        capped: scrapeResult.capped,
      },
      '[KB Scrape] Scraping complete, categorizing content',
    );

    // 2. Categorize via AI
    const categorizationResult = await categorizeContent(scrapeResult.pages);

    if (categorizationResult.documents.length === 0) {
      return NextResponse.json(
        { error: 'Content was scraped but could not be categorized into useful documents.' },
        { status: 422 },
      );
    }

    // 3. Upload categorized documents
    const settings = (account.phoneIntegrationSettings as any) ?? {};
    const provider = await getAccountProvider(account.id);

    const uploadedCategories: Record<
      string,
      { fileId?: string; charCount: number; sourcePages: string[] }
    > = {};

    let retellKnowledgeBaseId = settings.retellKnowledgeBaseId;
    let queryToolId = settings.queryToolId;
    let queryToolName = settings.queryToolName;
    const existingConfig: Record<string, string[]> =
      settings.knowledgeBaseConfig || {};
    let allFileIds: string[] = [];
    let scrapedDocsMeta: Record<string, { charCount: number; sourcePages: string[] }> = {};

    if (provider === 'RETELL') {
      // ── PRIMARY: Upload directly to Retell KB as .txt files ──────
      const { createRetellService } = await import(
        '@kit/shared/retell/retell.service'
      );
      const retellService = createRetellService();

      if (!retellService.isEnabled()) {
        return NextResponse.json(
          { error: 'RETELL_API_KEY is not configured' },
          { status: 503 },
        );
      }

      // Delete old Retell KB if it exists
      if (retellKnowledgeBaseId) {
        try {
          await retellService.deleteKnowledgeBase(retellKnowledgeBaseId);
          logger.info(
            { kbId: retellKnowledgeBaseId },
            '[KB Scrape] Deleted old Retell KB before re-upload',
          );
        } catch {
          // Non-fatal
        }
      }

      const docFiles = categorizationResult.documents.map((doc) => {
        const safeName = businessName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
        const safeCat = doc.categoryLabel.replace(/[^a-zA-Z0-9& -]/g, '').replace(/\s+/g, '-').toLowerCase();
        return {
          name: `${safeName}-${safeCat}.txt`,
          buffer: Buffer.from(doc.content, 'utf-8'),
          contentType: 'text/plain' as const,
        };
      });

      logger.info(
        {
          funcName,
          accountId,
          fileCount: docFiles.length,
          fileSizes: docFiles.map((f) => ({ name: f.name, bytes: f.buffer.length })),
        },
        '[KB Scrape] Uploading categorized documents as files to Retell',
      );

      const kb = await retellService.createKnowledgeBase({
        name: `kb-${accountId.slice(0, 8)}`,
        files: docFiles,
      });

      if (!kb) {
        return NextResponse.json(
          { error: 'Failed to create Retell knowledge base' },
          { status: 500 },
        );
      }

      // Wait for processing
      const finalKb = await retellService.waitForKnowledgeBase(
        kb.knowledge_base_id,
      );

      logger.info(
        {
          kbId: kb.knowledge_base_id,
          status: finalKb?.status,
          sourceCount: finalKb?.knowledge_base_sources?.length ?? 0,
        },
        '[KB Scrape] Retell KB processing result',
      );

      if (finalKb?.status === 'error') {
        return NextResponse.json(
          { error: 'Retell knowledge base processing failed' },
          { status: 500 },
        );
      }

      retellKnowledgeBaseId = kb.knowledge_base_id;

      for (const doc of categorizationResult.documents) {
        const syntheticId = `retell-scraped-${doc.categoryId}`;
        uploadedCategories[doc.categoryId] = {
          charCount: doc.charCount,
          sourcePages: doc.sourcePages,
        };
        scrapedDocsMeta[doc.categoryId] = {
          charCount: doc.charCount,
          sourcePages: doc.sourcePages,
        };
        existingConfig[doc.categoryId] = [syntheticId];
      }

      logger.info(
        {
          funcName,
          accountId,
          retellKbId: retellKnowledgeBaseId,
          categories: Object.keys(uploadedCategories).length,
        },
        '[KB Scrape] Uploaded directly to Retell KB',
      );
    } else {
      // ── FALLBACK: Upload to Vapi Files API ──────────────────────────
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
          uploadedCategories[doc.categoryId] = {
            fileId,
            charCount: doc.charCount,
            sourcePages: doc.sourcePages,
          };

          if (!existingConfig[doc.categoryId]) {
            existingConfig[doc.categoryId] = [];
          }
          existingConfig[doc.categoryId]!.push(fileId);
        }
      }

      allFileIds = Object.values(existingConfig).flat().filter(Boolean);

      // Update Vapi query tool
      if (allFileIds.length > 0) {
        const result = await vapiService.ensureClinicQueryTool(
          account.id,
          allFileIds,
          settings.templateVersion || 'v2.0',
          businessName,
        );
        if (result) {
          queryToolId = result.toolId;
          queryToolName = result.toolName;
        }
      }
    }

    const uploadedCount = Object.keys(uploadedCategories).length;

    if (uploadedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to upload any documents' },
        { status: 500 },
      );
    }

    // Save to DB
    await prisma.account.update({
      where: { id: account.id },
      data: {
        phoneIntegrationSettings: {
          ...settings,
          knowledgeBaseConfig: existingConfig,
          knowledgeBaseFileIds: allFileIds.length > 0 ? allFileIds : undefined,
          queryToolId,
          queryToolName,
          retellKnowledgeBaseId,
          knowledgeBaseUpdatedAt: new Date().toISOString(),
          websiteScrapedUrl: parsedUrl.href,
          websiteScrapedAt: new Date().toISOString(),
          scrapedDocsMeta,
        },
      },
    });

    logger.info(
      {
        funcName,
        accountId,
        provider,
        uploadedCategories: uploadedCount,
        pagesScraped: scrapeResult.scrapedCount,
      },
      '[KB Scrape] Website scrape and KB upload complete',
    );

    // Attach KB to all deployed agents (inbound CF + outbound)
    if (provider === 'RETELL' && retellKnowledgeBaseId) {
      try {
        const { createRetellService: createSvc } = await import(
          '@kit/shared/retell/retell.service'
        );
        const retellSvc = createSvc();

        const kbIds = [retellKnowledgeBaseId as string];
        const flowsUpdated: string[] = [];

        const inboundFlowId =
          (settings.retellConversationFlow as any)?.conversationFlowId ||
          settings.conversationFlowId;
        if (inboundFlowId) {
          await retellSvc.updateConversationFlow(inboundFlowId, {
            knowledge_base_ids: kbIds,
          });
          flowsUpdated.push(`inbound:${inboundFlowId}`);
        }

        const outboundSettings = await prisma.outboundSettings.findUnique({
          where: { accountId: account.id },
          select: {
            patientCareRetellAgentId: true,
            financialRetellAgentId: true,
          },
        });

        const outboundAgentIds = [
          outboundSettings?.patientCareRetellAgentId,
          outboundSettings?.financialRetellAgentId,
        ].filter(Boolean) as string[];

        for (const oaId of outboundAgentIds) {
          try {
            const agentData = await retellSvc.getAgent(oaId);
            const flowId =
              (agentData?.response_engine as any)?.conversation_flow_id;
            if (flowId) {
              await retellSvc.updateConversationFlow(flowId, {
                knowledge_base_ids: kbIds,
              });
              flowsUpdated.push(`outbound:${flowId}`);
            }
          } catch (agentErr: any) {
            logger.warn(
              { error: agentErr?.message, agentId: oaId },
              '[KB Scrape] Failed to update outbound agent flow (non-fatal)',
            );
          }
        }

        if (flowsUpdated.length > 0) {
          logger.info(
            { accountId, flowsUpdated, kbId: retellKnowledgeBaseId },
            '[KB Scrape] Attached KB to conversation flows',
          );
        }
      } catch (attachErr: any) {
        logger.error(
          { error: attachErr?.message, accountId },
          '[KB Scrape] Failed to attach KB to agents (non-fatal)',
        );
      }
    }

    return NextResponse.json({
      success: true,
      provider,
      pagesDiscovered: scrapeResult.totalDiscovered,
      pagesScraped: scrapeResult.scrapedCount,
      capped: scrapeResult.capped,
      sectionsFound: categorizationResult.totalSections,
      documentsUploaded: uploadedCount,
      categories: uploadedCategories,
      retellKnowledgeBaseId: provider === 'RETELL' ? retellKnowledgeBaseId : undefined,
      totalFiles: allFileIds.length || uploadedCount,
      queryToolId,
    });
  } catch (error: any) {
    logger.error(
      { error: error?.message },
      '[KB Scrape] Failed to scrape website',
    );
    return NextResponse.json(
      { error: error?.message || 'Failed to scrape website' },
      { status: 500 },
    );
  }
}
