import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/is-admin', () => ({
  requireAdmin: jest.fn().mockResolvedValue(true),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

const mockUpdateConversationFlow = jest.fn().mockResolvedValue({ conversation_flow_id: 'flow-1' });

jest.mock('@kit/shared/retell/retell.service', () => ({
  createRetellService: () => ({
    isEnabled: () => true,
    updateConversationFlow: mockUpdateConversationFlow,
  }),
}));

const mockBuildDentalClinicFlow = jest.fn().mockReturnValue({
  nodes: [],
  tools: [],
  global_prompt: '',
  start_node_id: 'receptionist',
});

jest.mock('@kit/shared/retell/templates/conversation-flow/dental-clinic.flow-template', () => ({
  buildDentalClinicFlow: (...args: any[]) => mockBuildDentalClinicFlow(...args),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/update-retell-flow', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/update-retell-flow', () => {
  afterEach(() => jest.clearAllMocks());

  it('passes knowledgeBaseIds from settings to buildDentalClinicFlow', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      id: 'acc-1',
      name: 'Test Dental',
      brandingBusinessName: 'Test Dental',
      brandingContactPhone: '+15551234567',
      phoneIntegrationSettings: {
        retellConversationFlow: {
          agentId: 'agent-1',
          conversationFlowId: 'flow-1',
          version: 'cf-v1.10',
        },
        retellKnowledgeBaseId: 'kb-existing-123',
      },
    });

    const res = await POST(makeRequest({ accountId: 'acc-1' }));
    expect(res.status).toBe(200);

    expect(mockBuildDentalClinicFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeBaseIds: ['kb-existing-123'],
      }),
    );
  });

  it('builds flow without KB when retellKnowledgeBaseId is absent', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      id: 'acc-1',
      name: 'Test Dental',
      brandingBusinessName: 'Test Dental',
      brandingContactPhone: null,
      phoneIntegrationSettings: {
        retellConversationFlow: {
          agentId: 'agent-1',
          conversationFlowId: 'flow-1',
          version: 'cf-v1.10',
        },
      },
    });

    const res = await POST(makeRequest({ accountId: 'acc-1' }));
    expect(res.status).toBe(200);

    expect(mockBuildDentalClinicFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeBaseIds: undefined,
      }),
    );
  });

  it('logs a warning when no KB is found', async () => {
    const { getLogger } = require('@kit/shared/logger');
    const mockLogger = await getLogger();

    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      id: 'acc-1',
      name: 'Test Dental',
      brandingBusinessName: null,
      brandingContactPhone: null,
      phoneIntegrationSettings: {
        retellConversationFlow: {
          agentId: 'agent-1',
          conversationFlowId: 'flow-1',
          version: 'cf-v1.10',
        },
      },
    });

    await POST(makeRequest({ accountId: 'acc-1' }));

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc-1' }),
      expect.stringContaining('No retellKnowledgeBaseId found'),
    );
  });

  it('returns 400 when accountId is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ accountId: 'acc-missing' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when no conversation flow is deployed', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      id: 'acc-1',
      name: 'Test Dental',
      brandingBusinessName: null,
      brandingContactPhone: null,
      phoneIntegrationSettings: {},
    });

    const res = await POST(makeRequest({ accountId: 'acc-1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No conversation flow deployed');
  });

  it('calls updateConversationFlow with built flow config', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      id: 'acc-1',
      name: 'Test Dental',
      brandingBusinessName: 'Test Dental',
      brandingContactPhone: null,
      phoneIntegrationSettings: {
        retellConversationFlow: {
          agentId: 'agent-1',
          conversationFlowId: 'flow-abc',
          version: 'cf-v1.10',
        },
        retellKnowledgeBaseId: 'kb-xyz',
      },
    });

    await POST(makeRequest({ accountId: 'acc-1' }));

    expect(mockUpdateConversationFlow).toHaveBeenCalledWith(
      'flow-abc',
      expect.any(Object),
    );
  });
});
