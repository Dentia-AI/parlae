import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/server';
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

    // 3. Upload each category document to Vapi
    const vapiService = createVapiService();
    const settings = (account.phoneIntegrationSettings as any) ?? {};
    const existingConfig: Record<string, string[]> =
      settings.knowledgeBaseConfig || {};

    const uploadedCategories: Record<
      string,
      { fileId: string; charCount: number; sourcePages: string[] }
    > = {};

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

    const uploadedCount = Object.keys(uploadedCategories).length;

    if (uploadedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to upload any documents to Vapi' },
        { status: 500 },
      );
    }

    // 4. Update query tool with all file IDs
    const allFileIds = Object.values(existingConfig).flat().filter(Boolean);
    let queryToolId = settings.queryToolId;
    let queryToolName = settings.queryToolName;

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

    // 5. Sync to Retell if needed
    let retellKnowledgeBaseId = settings.retellKnowledgeBaseId;
    const provider = await getAccountProvider(account.id);

    if (provider === 'RETELL' && allFileIds.length > 0) {
      try {
        const { syncVapiKBToRetell } = await import(
          '@kit/shared/retell/retell-kb.service'
        );
        const newKbId = await syncVapiKBToRetell(
          account.id,
          allFileIds,
          businessName,
          retellKnowledgeBaseId || undefined,
        );
        if (newKbId) {
          retellKnowledgeBaseId = newKbId;
        }
      } catch (retellErr: any) {
        logger.error(
          { error: retellErr?.message, accountId },
          '[KB Scrape] Retell KB sync failed (non-fatal)',
        );
      }
    }

    // 6. Save to DB
    await prisma.account.update({
      where: { id: account.id },
      data: {
        phoneIntegrationSettings: {
          ...settings,
          knowledgeBaseConfig: existingConfig,
          knowledgeBaseFileIds: allFileIds,
          queryToolId,
          queryToolName,
          retellKnowledgeBaseId,
          knowledgeBaseUpdatedAt: new Date().toISOString(),
          websiteScrapedUrl: parsedUrl.href,
          websiteScrapedAt: new Date().toISOString(),
        },
      },
    });

    logger.info(
      {
        funcName,
        accountId,
        uploadedCategories: uploadedCount,
        totalFiles: allFileIds.length,
        pagesScraped: scrapeResult.scrapedCount,
      },
      '[KB Scrape] Website scrape and KB upload complete',
    );

    return NextResponse.json({
      success: true,
      pagesDiscovered: scrapeResult.totalDiscovered,
      pagesScraped: scrapeResult.scrapedCount,
      capped: scrapeResult.capped,
      sectionsFound: categorizationResult.totalSections,
      documentsUploaded: uploadedCount,
      categories: uploadedCategories,
      totalFiles: allFileIds.length,
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
