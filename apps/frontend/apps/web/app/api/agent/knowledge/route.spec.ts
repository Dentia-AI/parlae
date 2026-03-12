jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn(() =>
    Promise.resolve({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  ),
}));

jest.mock('@kit/shared/voice-provider', () => ({
  getAccountProvider: jest.fn(() => Promise.resolve('RETELL')),
}));

const mockAttachKbToFlowNodes = jest.fn().mockResolvedValue(true);
const mockUpdateConversationFlow = jest.fn().mockResolvedValue({});
const mockGetAgent = jest.fn();

jest.mock('@kit/shared/retell/retell.service', () => ({
  createRetellService: () => ({
    attachKbToFlowNodes: mockAttachKbToFlowNodes,
    updateConversationFlow: mockUpdateConversationFlow,
    getAgent: mockGetAgent,
  }),
}));

let afterPromise: Promise<void> | null = null;

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    NextResponse: {
      json: (body: any, init?: any) => ({
        json: () => Promise.resolve(body),
        status: init?.status ?? 200,
        body,
      }),
    },
    after: jest.fn((fn: () => void) => {
      afterPromise = Promise.resolve(fn()).catch(() => {});
    }),
  };
});

import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

const mockPrisma = prisma as any;
const mockRequireSession = requireSession as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/agent/knowledge ──────────────────────────────────────────

describe('GET /api/agent/knowledge', () => {
  let GET: typeof import('./route').GET;

  beforeAll(async () => {
    const mod = await import('./route');
    GET = mod.GET;
  });

  it('should return 401 if no user in session', async () => {
    mockRequireSession.mockResolvedValue({ user: {} });

    const res = await GET();
    const body = await (res as any).json();
    expect((res as any).status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('should return 404 if no account found', async () => {
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockPrisma.account.findFirst.mockResolvedValue(null);

    const res = await GET();
    const body = await (res as any).json();
    expect((res as any).status).toBe(404);
    expect(body.error).toBe('Account not found');
  });

  it('should return KB config, metadata, and scraped docs', async () => {
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } });

    const mockSettings = {
      knowledgeBaseConfig: {
        services: ['retell-scraped-services'],
        faqs: ['retell-scraped-faqs'],
      },
      knowledgeBaseFileIds: ['retell-scraped-services', 'retell-scraped-faqs'],
      queryToolId: 'tool-123',
      websiteScrapedUrl: 'https://clinic.com',
      websiteScrapedAt: '2026-03-01T00:00:00Z',
      scrapedDocsMeta: {
        services: { charCount: 5400, sourcePages: ['https://clinic.com/services'] },
        faqs: { charCount: 2100, sourcePages: ['https://clinic.com/faq'] },
      },
    };

    mockPrisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      phoneIntegrationSettings: mockSettings,
      brandingBusinessName: 'Downtown Dental',
      name: 'Test Account',
      paymentMethodVerified: true,
    });

    const res = await GET();
    const body = await (res as any).json();

    expect(body.accountId).toBe('account-1');
    expect(body.businessName).toBe('Downtown Dental');
    expect(body.knowledgeBaseConfig.services).toEqual(['retell-scraped-services']);
    expect(body.queryToolId).toBe('tool-123');
    expect(body.websiteUrl).toBe('https://clinic.com');
    expect(body.websiteScrapedAt).toBe('2026-03-01T00:00:00Z');
    expect(body.scrapedDocsMeta?.services.charCount).toBe(5400);
    expect(body.paymentMethodVerified).toBe(true);
    expect(body.totalFiles).toBe(2);
  });

  it('should fall back to account name if no branding name', async () => {
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } });

    mockPrisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      phoneIntegrationSettings: {},
      brandingBusinessName: null,
      name: 'Fallback Name',
      paymentMethodVerified: false,
    });

    const res = await GET();
    const body = await (res as any).json();
    expect(body.businessName).toBe('Fallback Name');
  });

  it('should handle empty phoneIntegrationSettings', async () => {
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } });

    mockPrisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      phoneIntegrationSettings: null,
      brandingBusinessName: null,
      name: 'Test',
      paymentMethodVerified: false,
    });

    const res = await GET();
    const body = await (res as any).json();
    expect(body.knowledgeBaseConfig).toEqual({});
    expect(body.knowledgeBaseFileIds).toEqual([]);
    expect(body.totalFiles).toBe(0);
    expect(body.scrapedDocsMeta).toBeUndefined();
  });
});

// ── PUT /api/agent/knowledge ──────────────────────────────────────────

describe('PUT /api/agent/knowledge', () => {
  let PUT: typeof import('./route').PUT;

  beforeAll(async () => {
    const mod = await import('./route');
    PUT = mod.PUT;
  });

  function makeRequest(body: any) {
    return {
      json: () => Promise.resolve(body),
    } as any;
  }

  it('should return 401 if no user in session', async () => {
    mockRequireSession.mockResolvedValue({ user: {} });

    const res = await PUT(makeRequest({ knowledgeBaseConfig: {} }));
    const body = await (res as any).json();
    expect((res as any).status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('should return 400 if no knowledgeBaseConfig', async () => {
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } });

    const res = await PUT(makeRequest({}));
    const body = await (res as any).json();
    expect((res as any).status).toBe(400);
    expect(body.error).toContain('knowledgeBaseConfig is required');
  });

  it('should save KB config and return success', async () => {
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } });

    mockPrisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      phoneIntegrationSettings: {
        queryToolId: 'tool-1',
        queryToolName: 'query-tool',
        retellKnowledgeBaseId: 'kb-123',
        conversationFlowId: 'flow-1',
      },
      brandingBusinessName: 'Clinic',
      name: 'Test',
    });

    mockPrisma.account.update.mockResolvedValue({});

    const res = await PUT(
      makeRequest({
        knowledgeBaseConfig: {
          services: ['retell-scraped-services'],
          faqs: ['file-real-id'],
        },
        websiteUrl: 'https://clinic.com',
      }),
    );

    const body = await (res as any).json();
    expect(body.success).toBe(true);
    expect(body.queryToolId).toBe('tool-1');
    expect(body.retellKnowledgeBaseId).toBe('kb-123');
    expect(body.totalFiles).toBe(2);

    expect(mockPrisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'account-1' },
        data: expect.objectContaining({
          phoneIntegrationSettings: expect.objectContaining({
            knowledgeBaseConfig: {
              services: ['retell-scraped-services'],
              faqs: ['file-real-id'],
            },
            websiteUrl: 'https://clinic.com',
            websiteScrapedUrl: 'https://clinic.com',
          }),
        }),
      }),
    );
  });

  it('should filter retell-scraped IDs as real file IDs', async () => {
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } });

    mockPrisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      phoneIntegrationSettings: {},
      brandingBusinessName: 'Clinic',
      name: 'Test',
    });
    mockPrisma.account.update.mockResolvedValue({});

    const kbConfig = {
      services: ['retell-scraped-services'],
      faqs: ['retell-scraped-faqs', 'real-file-abc'],
    };

    const res = await PUT(makeRequest({ knowledgeBaseConfig: kbConfig }));
    const body = await (res as any).json();

    expect(body.totalFiles).toBe(3);
  });

  it('should call attachKbToFlowNodes for inbound flow in background', async () => {
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } });

    mockPrisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      phoneIntegrationSettings: {
        queryToolId: 'tool-1',
        queryToolName: 'query-tool',
        retellKnowledgeBaseId: 'kb-abc',
        retellConversationFlow: {
          conversationFlowId: 'flow-inbound-1',
          agentId: 'agent-1',
        },
      },
      brandingBusinessName: 'Clinic',
      name: 'Test',
    });
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.outboundSettings.findUnique.mockResolvedValue(null);
    mockAttachKbToFlowNodes.mockResolvedValue(true);

    await PUT(makeRequest({ knowledgeBaseConfig: { about: ['file-1'] } }));
    if (afterPromise) await afterPromise;

    expect(mockAttachKbToFlowNodes).toHaveBeenCalledWith(
      'flow-inbound-1',
      ['kb-abc'],
      ['receptionist', 'faq'],
    );
  });

  it('should use flow-level update for outbound flows in background', async () => {
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } });

    mockPrisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      phoneIntegrationSettings: {
        retellKnowledgeBaseId: 'kb-abc',
        retellConversationFlow: {
          conversationFlowId: 'flow-inbound-1',
        },
      },
      brandingBusinessName: 'Clinic',
      name: 'Test',
    });
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.outboundSettings.findUnique.mockResolvedValue({
      patientCareRetellAgentId: 'ob-agent-1',
      financialRetellAgentId: null,
    });
    mockGetAgent.mockResolvedValue({
      response_engine: { conversation_flow_id: 'ob-flow-1' },
    });
    mockAttachKbToFlowNodes.mockResolvedValue(true);
    mockUpdateConversationFlow.mockResolvedValue({});

    await PUT(makeRequest({ knowledgeBaseConfig: { about: ['file-1'] } }));
    if (afterPromise) await afterPromise;

    expect(mockUpdateConversationFlow).toHaveBeenCalledWith('ob-flow-1', {
      knowledge_base_ids: ['kb-abc'],
    });
  });

  it('should skip background sync when no retellKnowledgeBaseId', async () => {
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } });

    mockPrisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      phoneIntegrationSettings: {
        conversationFlowId: 'flow-1',
      },
      brandingBusinessName: 'Clinic',
      name: 'Test',
    });
    mockPrisma.account.update.mockResolvedValue({});

    await PUT(makeRequest({ knowledgeBaseConfig: { about: ['file-1'] } }));
    if (afterPromise) await afterPromise;

    expect(mockAttachKbToFlowNodes).not.toHaveBeenCalled();
    expect(mockUpdateConversationFlow).not.toHaveBeenCalled();
  });
});
