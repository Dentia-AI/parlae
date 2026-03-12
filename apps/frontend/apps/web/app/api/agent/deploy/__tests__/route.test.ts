import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  getEffectiveUserId: jest.fn().mockResolvedValue('user-1'),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'acc-1',
        phoneIntegrationSettings: {},
        phoneIntegrationMethod: 'vapi',
        brandingBusinessName: 'Test Dental',
        name: 'Test Dental',
      }),
      findUnique: jest.fn().mockResolvedValue({
        phoneIntegrationSettings: {},
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    outboundSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  },
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

jest.mock('../../../../home/(user)/agent/setup/_lib/actions', () => ({
  executeDeployment: jest.fn().mockResolvedValue({ success: true }),
}));

const mockScrapeWebsite = jest.fn();
const mockCategorizeContent = jest.fn();
const mockGetAccountProvider = jest.fn().mockResolvedValue('RETELL');
const mockCreateRetellService = jest.fn();

jest.mock('@kit/shared/scraper/website-scraper', () => ({
  scrapeWebsite: (...args: any[]) => mockScrapeWebsite(...args),
}));

jest.mock('@kit/shared/scraper/categorize-content', () => ({
  categorizeContent: (...args: any[]) => mockCategorizeContent(...args),
}));

jest.mock('@kit/shared/voice-provider', () => ({
  getAccountProvider: (...args: any[]) => mockGetAccountProvider(...args),
}));

jest.mock('@kit/shared/retell/retell.service', () => ({
  createRetellService: (...args: any[]) => mockCreateRetellService(...args),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/agent/deploy', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/agent/deploy', () => {
  afterEach(() => jest.clearAllMocks());

  it('sets status to in_progress and runs deployment', async () => {
    const { prisma } = require('@kit/prisma');
    const res = await POST(
      makeRequest({ voice: { voiceId: 'v1', name: 'Test Voice' } }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(prisma.account.update).toHaveBeenCalled();
  });

  it('returns 400 when voice is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    const { getEffectiveUserId } = require('~/lib/auth/get-session');
    getEffectiveUserId.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ voice: { voiceId: 'v1' } }));
    expect(res.status).toBe(401);
  });

  it('initializes feature settings on first successful deployment', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique
      .mockResolvedValueOnce({ phoneIntegrationSettings: {} })
      .mockResolvedValueOnce({ featureSettings: {} });

    const res = await POST(
      makeRequest({ voice: { voiceId: 'v1', name: 'Test Voice' } }),
    );

    expect(res.status).toBe(200);

    const updateCalls = prisma.account.update.mock.calls;
    const lastUpdateData = updateCalls[updateCalls.length - 1]?.[0]?.data;

    expect(lastUpdateData?.featureSettings).toBeDefined();
    expect(lastUpdateData.featureSettings['ai-receptionist']).toBe(true);
    expect(lastUpdateData.featureSettings['inbound-calls']).toBe(true);
    expect(lastUpdateData.featureSettings['sms-confirmations']).toBe(true);
    expect(lastUpdateData.featureSettings['email-confirmations']).toBe(true);
    expect(lastUpdateData.featureSettings['outbound-calls']).toBeUndefined();
  });

  it('does not overwrite feature settings if already initialized', async () => {
    const { prisma } = require('@kit/prisma');
    const existingFeatures = {
      'ai-receptionist': false,
      'inbound-calls': false,
      'sms-confirmations': true,
    };
    prisma.account.findUnique
      .mockResolvedValueOnce({ phoneIntegrationSettings: {} })
      .mockResolvedValueOnce({ featureSettings: existingFeatures });

    const res = await POST(
      makeRequest({ voice: { voiceId: 'v1', name: 'Test Voice' } }),
    );

    expect(res.status).toBe(200);

    const updateCalls = prisma.account.update.mock.calls;
    const lastUpdateData = updateCalls[updateCalls.length - 1]?.[0]?.data;

    expect(lastUpdateData.featureSettings).toBeUndefined();
  });

  describe('website KB auto-scrape', () => {
    beforeEach(() => {
      mockScrapeWebsite.mockReset();
      mockCategorizeContent.mockReset();
      mockCreateRetellService.mockReset();
      mockGetAccountProvider.mockReset().mockResolvedValue('RETELL');
    });

    it('scrapes website when brandingWebsite is set and no existing KB', async () => {
      const { prisma } = require('@kit/prisma');
      prisma.account.findFirst.mockResolvedValueOnce({
        id: 'acc-1',
        phoneIntegrationSettings: {},
        brandingBusinessName: 'Test Dental',
        brandingWebsite: 'https://testdental.com',
        name: 'Test Dental',
      });

      mockScrapeWebsite.mockResolvedValue({
        pages: [{ url: 'https://testdental.com', content: 'We are a dental clinic.' }],
        scrapedCount: 1,
        skippedPages: [],
      });
      mockCategorizeContent.mockResolvedValue({
        documents: [{ categoryId: 'about', content: 'We are a dental clinic.' }],
      });
      mockCreateRetellService.mockReturnValue({
        isEnabled: () => true,
        createKnowledgeBase: jest.fn().mockResolvedValue({ knowledge_base_id: 'kb-123' }),
        waitForKnowledgeBase: jest.fn().mockResolvedValue(undefined),
      });

      const res = await POST(
        makeRequest({ voice: { voiceId: 'v1', name: 'Test Voice' } }),
      );

      expect(res.status).toBe(200);
      expect(mockScrapeWebsite).toHaveBeenCalledWith('https://testdental.com');
    });

    it('scrapes even when websiteScrapedAt is set but no KB ID exists', async () => {
      const { prisma } = require('@kit/prisma');
      prisma.account.findFirst.mockResolvedValueOnce({
        id: 'acc-1',
        phoneIntegrationSettings: {
          websiteScrapedAt: '2026-01-01T00:00:00Z',
        },
        brandingBusinessName: 'Test Dental',
        brandingWebsite: 'https://testdental.com',
        name: 'Test Dental',
      });

      mockScrapeWebsite.mockResolvedValue({ pages: [], scrapedCount: 0, skippedPages: [] });

      const res = await POST(
        makeRequest({ voice: { voiceId: 'v1', name: 'Test Voice' } }),
      );

      expect(res.status).toBe(200);
      expect(mockScrapeWebsite).toHaveBeenCalledWith('https://testdental.com');
    });

    it('skips scrape when retellKnowledgeBaseId already exists', async () => {
      const { prisma } = require('@kit/prisma');
      prisma.account.findFirst.mockResolvedValueOnce({
        id: 'acc-1',
        phoneIntegrationSettings: {
          retellKnowledgeBaseId: 'kb-existing',
          websiteScrapedAt: '2026-01-01T00:00:00Z',
        },
        brandingBusinessName: 'Test Dental',
        brandingWebsite: 'https://testdental.com',
        name: 'Test Dental',
      });

      const res = await POST(
        makeRequest({ voice: { voiceId: 'v1', name: 'Test Voice' } }),
      );

      expect(res.status).toBe(200);
      expect(mockScrapeWebsite).not.toHaveBeenCalled();
    });

    it('skips scrape when knowledgeBaseFileIds already exist (Vapi)', async () => {
      const { prisma } = require('@kit/prisma');
      prisma.account.findFirst.mockResolvedValueOnce({
        id: 'acc-1',
        phoneIntegrationSettings: {
          knowledgeBaseFileIds: ['file-1', 'file-2'],
        },
        brandingBusinessName: 'Test Dental',
        brandingWebsite: 'https://testdental.com',
        name: 'Test Dental',
      });

      const res = await POST(
        makeRequest({ voice: { voiceId: 'v1', name: 'Test Voice' } }),
      );

      expect(res.status).toBe(200);
      expect(mockScrapeWebsite).not.toHaveBeenCalled();
    });

    it('skips scrape when body includes knowledgeBaseConfig with file IDs', async () => {
      const { prisma } = require('@kit/prisma');
      prisma.account.findFirst.mockResolvedValueOnce({
        id: 'acc-1',
        phoneIntegrationSettings: {},
        brandingBusinessName: 'Test Dental',
        brandingWebsite: 'https://testdental.com',
        name: 'Test Dental',
      });

      const res = await POST(
        makeRequest({
          voice: { voiceId: 'v1', name: 'Test Voice' },
          knowledgeBaseConfig: { about: ['file-1'] },
        }),
      );

      expect(res.status).toBe(200);
      expect(mockScrapeWebsite).not.toHaveBeenCalled();
    });

    it('persists retellKnowledgeBaseId to DB before calling executeDeployment', async () => {
      const { prisma } = require('@kit/prisma');
      const { executeDeployment } = require('../../../../home/(user)/agent/setup/_lib/actions');

      prisma.account.findFirst.mockResolvedValueOnce({
        id: 'acc-1',
        phoneIntegrationSettings: {},
        brandingBusinessName: 'Test Dental',
        brandingWebsite: 'https://testdental.com',
        name: 'Test Dental',
      });

      mockScrapeWebsite.mockResolvedValue({
        pages: [{ url: 'https://testdental.com', content: 'Dental clinic.' }],
        scrapedCount: 1,
        skippedPages: [],
      });
      mockCategorizeContent.mockResolvedValue({
        documents: [{ categoryId: 'about', content: 'Dental clinic.', categoryLabel: 'About' }],
      });

      const mockKbCreate = jest.fn().mockResolvedValue({ knowledge_base_id: 'kb-auto-123' });
      const mockKbWait = jest.fn().mockResolvedValue({ status: 'complete' });
      mockCreateRetellService.mockReturnValue({
        isEnabled: () => true,
        createKnowledgeBase: mockKbCreate,
        waitForKnowledgeBase: mockKbWait,
      });

      const updateCallOrder: string[] = [];
      prisma.account.update.mockImplementation(async (args: any) => {
        const data = args?.data?.phoneIntegrationSettings;
        if (data?.retellKnowledgeBaseId) {
          updateCallOrder.push('kb_persisted');
        }
        return {};
      });
      executeDeployment.mockImplementation(async () => {
        updateCallOrder.push('deploy_called');
        return { success: true };
      });

      const res = await POST(
        makeRequest({ voice: { voiceId: 'v1', name: 'Test Voice' } }),
      );

      expect(res.status).toBe(200);
      expect(mockKbCreate).toHaveBeenCalled();

      const kbIdx = updateCallOrder.indexOf('kb_persisted');
      const deployIdx = updateCallOrder.indexOf('deploy_called');
      expect(kbIdx).toBeGreaterThanOrEqual(0);
      expect(deployIdx).toBeGreaterThanOrEqual(0);
      expect(kbIdx).toBeLessThan(deployIdx);
    });

    it('continues deployment when scrape fails', async () => {
      const { prisma } = require('@kit/prisma');
      prisma.account.findFirst.mockResolvedValueOnce({
        id: 'acc-1',
        phoneIntegrationSettings: {},
        brandingBusinessName: 'Test Dental',
        brandingWebsite: 'https://testdental.com',
        name: 'Test Dental',
      });

      mockScrapeWebsite.mockRejectedValue(new Error('Network error'));

      const res = await POST(
        makeRequest({ voice: { voiceId: 'v1', name: 'Test Voice' } }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});
