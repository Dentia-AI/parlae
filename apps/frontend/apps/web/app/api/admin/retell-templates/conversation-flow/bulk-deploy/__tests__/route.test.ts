import { POST } from '../route';
import { NextRequest } from 'next/server';

const mockUpdatePhoneNumber = jest.fn().mockResolvedValue({ phone_number: '+15551234567' });
const mockImportPhoneNumber = jest.fn().mockResolvedValue({ phone_number: '+15551234567' });
const mockDeployRetellConversationFlow = jest.fn().mockResolvedValue({
  agentId: 'new-agent-id',
  conversationFlowId: 'new-flow-id',
  version: 'cf-v1.1',
});
const mockTeardownRetellConversationFlow = jest.fn().mockResolvedValue(undefined);

jest.mock('@kit/prisma', () => ({
  prisma: {
    retellConversationFlowTemplate: {
      findUnique: jest.fn().mockResolvedValue({ id: 'tpl-1', name: 'test-flow' }),
    },
    account: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({
        brandingBusinessName: 'Test Clinic',
        name: 'Test Clinic',
        brandingContactPhone: null,
        phoneIntegrationSettings: {
          phoneNumber: '+15551234567',
          retellReceptionistAgentId: 'old-agent-id',
          conversationFlowId: 'old-flow-id',
          voiceConfig: { voiceId: 'retell-Chloe' },
          sipTerminationUri: 'sip:test@trunk.twilio.com',
        },
      }),
      update: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    },
    retellPhoneNumber: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({ retellPhoneId: 'rph-1' }),
    },
  },
}));

jest.mock('~/lib/auth/is-admin', () => ({
  requireAdmin: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('@kit/shared/retell/retell.service', () => ({
  createRetellService: () => ({
    isEnabled: () => true,
    updatePhoneNumber: mockUpdatePhoneNumber,
    importPhoneNumber: mockImportPhoneNumber,
  }),
}));

jest.mock('@kit/shared/retell/templates/conversation-flow/flow-deploy-utils', () => ({
  deployRetellConversationFlow: mockDeployRetellConversationFlow,
  teardownRetellConversationFlow: mockTeardownRetellConversationFlow,
}));

function makeRequest(body) {
  return new NextRequest('http://localhost/api/admin/retell-templates/conversation-flow/bulk-deploy', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/retell-templates/conversation-flow/bulk-deploy', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 400 when templateId or accountIds are missing', async () => {
    const res = await POST(makeRequest({ templateId: '', accountIds: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when template does not exist', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.retellConversationFlowTemplate.findUnique.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ templateId: 'bad', accountIds: ['acc-1'] }));
    expect(res.status).toBe(404);
  });

  it('tears down old agent, deploys new agent, and re-links phone', async () => {
    const res = await POST(makeRequest({ templateId: 'tpl-1', accountIds: ['acc-1'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.deployResults).toHaveLength(1);
    expect(body.deployResults[0].success).toBe(true);

    expect(mockTeardownRetellConversationFlow).toHaveBeenCalledWith(
      expect.anything(),
      'old-agent-id',
      'old-flow-id',
    );

    expect(mockDeployRetellConversationFlow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clinicName: 'Test Clinic',
        accountId: 'acc-1',
        voiceId: 'retell-Chloe',
      }),
    );
  });

  it('calls updatePhoneNumber with new agent ID to re-link phone', async () => {
    await POST(makeRequest({ templateId: 'tpl-1', accountIds: ['acc-1'] }));

    expect(mockUpdatePhoneNumber).toHaveBeenCalledWith('+15551234567', {
      inbound_agent_id: 'new-agent-id',
      nickname: 'Test Clinic - Conversation Flow (cf-v1.1)',
    });
    expect(mockImportPhoneNumber).not.toHaveBeenCalled();
  });

  it('falls back to importPhoneNumber when updatePhoneNumber fails', async () => {
    mockUpdatePhoneNumber.mockRejectedValueOnce(new Error('Phone not found'));

    await POST(makeRequest({ templateId: 'tpl-1', accountIds: ['acc-1'] }));

    expect(mockUpdatePhoneNumber).toHaveBeenCalled();
    expect(mockImportPhoneNumber).toHaveBeenCalledWith({
      phoneNumber: '+15551234567',
      terminationUri: 'sip:test@trunk.twilio.com',
      inboundAgentId: 'new-agent-id',
      nickname: 'Test Clinic - Conversation Flow (cf-v1.1)',
    });
  });

  it('does not call phone methods when account has no phoneNumber', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      brandingBusinessName: 'No Phone Clinic',
      name: 'No Phone Clinic',
      brandingContactPhone: null,
      phoneIntegrationSettings: {
        retellReceptionistAgentId: 'old-agent-id',
        conversationFlowId: 'old-flow-id',
      },
    });

    const res = await POST(makeRequest({ templateId: 'tpl-1', accountIds: ['acc-1'] }));
    const body = await res.json();

    expect(body.deployResults[0].success).toBe(true);
    expect(mockUpdatePhoneNumber).not.toHaveBeenCalled();
    expect(mockImportPhoneNumber).not.toHaveBeenCalled();
  });

  it('updates DB phone record with new agent and flow IDs', async () => {
    const { prisma } = require('@kit/prisma');

    await POST(makeRequest({ templateId: 'tpl-1', accountIds: ['acc-1'] }));

    expect(prisma.retellPhoneNumber.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', isActive: true },
      data: {
        retellAgentId: 'new-agent-id',
        retellAgentIds: { conversationFlow: { agentId: 'new-agent-id', flowId: 'new-flow-id' } },
      },
    });
  });

  it('still succeeds if both updatePhoneNumber and importPhoneNumber fail', async () => {
    mockUpdatePhoneNumber.mockRejectedValueOnce(new Error('update failed'));
    mockImportPhoneNumber.mockRejectedValueOnce(new Error('import failed'));

    const res = await POST(makeRequest({ templateId: 'tpl-1', accountIds: ['acc-1'] }));
    const body = await res.json();

    expect(body.deployResults[0].success).toBe(true);
  });

  it('preserves user voice and knowledge base config during deploy', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce({
      brandingBusinessName: 'Custom Voice Clinic',
      name: 'Custom Voice Clinic',
      brandingContactPhone: null,
      phoneIntegrationSettings: {
        phoneNumber: '+15559876543',
        retellReceptionistAgentId: 'old-id',
        conversationFlowId: 'old-flow',
        voiceConfig: { voiceId: '11labs-custom-voice' },
        retellKnowledgeBaseId: 'kb-123',
      },
    });

    await POST(makeRequest({ templateId: 'tpl-1', accountIds: ['acc-1'] }));

    expect(mockDeployRetellConversationFlow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        voiceId: '11labs-custom-voice',
        knowledgeBaseIds: ['kb-123'],
      }),
    );
  });
});
