import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
      findUnique: jest.fn().mockResolvedValue({
        brandingTimezone: 'America/Toronto',
        name: 'Test Clinic',
        brandingBusinessName: null,
        phoneIntegrationSettings: {},
      }),
    },
    outboundSettings: {
      findUnique: jest.fn().mockResolvedValue({
        accountId: 'acc-1',
        patientCareEnabled: false,
        financialEnabled: false,
        patientCareRetellAgentId: null,
        financialRetellAgentId: null,
        channelDefaults: {},
        outboundUpgradeHistory: [],
        fromPhoneNumberId: null,
      }),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ accountId: 'acc-1', ...data }),
      ),
      upsert: jest.fn().mockImplementation(({ update }) =>
        Promise.resolve({ accountId: 'acc-1', ...update }),
      ),
    },
    outboundAgentTemplate: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'tpl-1',
        agentGroup: 'PATIENT_CARE',
        version: 'v1.0',
        flowConfig: { some: 'config' },
      }),
    },
    retellPhoneNumber: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));

jest.mock('@kit/shared/retell/retell.service', () => ({
  createRetellService: jest.fn().mockReturnValue({
    isEnabled: () => true,
    createConversationFlow: jest.fn().mockResolvedValue({ conversation_flow_id: 'flow-1' }),
    createAgent: jest.fn().mockResolvedValue({ agent_id: 'agent-1' }),
    deleteConversationFlow: jest.fn(),
  }),
}));

jest.mock('@kit/shared/retell/templates/dental-clinic.retell-template', () => ({
  SHARED_RETELL_AGENT_CONFIG: {},
  RETELL_POST_CALL_ANALYSIS: [],
}));

jest.mock('@kit/shared/retell/templates/outbound/patient-care.flow-template', () => ({
  buildPatientCareOutboundFlow: jest.fn().mockReturnValue({ nodes: [], start_speaker: 'agent' }),
}));

jest.mock('@kit/shared/retell/templates/outbound/financial.flow-template', () => ({
  buildFinancialOutboundFlow: jest.fn().mockReturnValue({ nodes: [], start_speaker: 'agent' }),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/outbound/settings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/outbound/settings', () => {
  afterEach(() => jest.clearAllMocks());

  it('setAutoApprove updates the autoApproveCampaigns field', async () => {
    const { prisma } = require('@kit/prisma');
    const res = await POST(makeRequest({ action: 'setAutoApprove', value: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(prisma.outboundSettings.update).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      data: { autoApproveCampaigns: true },
    });
  });

  it('disable sets the group field to false', async () => {
    const { prisma } = require('@kit/prisma');
    const res = await POST(makeRequest({ action: 'disable', group: 'PATIENT_CARE' }));

    expect(res.status).toBe(200);
    expect(prisma.outboundSettings.update).toHaveBeenCalledWith({
      where: { accountId: 'acc-1' },
      data: { patientCareEnabled: false },
    });
  });

  it('enable PATIENT_CARE upserts settings with defaults', async () => {
    const { prisma } = require('@kit/prisma');
    const res = await POST(makeRequest({ action: 'enable', group: 'PATIENT_CARE' }));

    expect(res.status).toBe(200);
    expect(prisma.outboundSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'acc-1' },
        update: expect.objectContaining({
          patientCareEnabled: true,
          timezone: 'America/Toronto',
        }),
      }),
    );
  });

  it('skips agent creation when agent already exists', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.outboundSettings.findUnique.mockResolvedValueOnce({
      accountId: 'acc-1',
      patientCareRetellAgentId: 'existing-agent',
      channelDefaults: {},
      outboundUpgradeHistory: [],
    });

    const { createRetellService } = require('@kit/shared/retell/retell.service');

    await POST(makeRequest({ action: 'enable', group: 'PATIENT_CARE' }));

    const retell = createRetellService();
    expect(retell.createConversationFlow).not.toHaveBeenCalled();
  });

  it('returns 500 and does not enable when agent deployment fails', async () => {
    const { prisma } = require('@kit/prisma');
    const { createRetellService } = require('@kit/shared/retell/retell.service');
    const retell = createRetellService();
    retell.createConversationFlow.mockRejectedValueOnce(
      new Error('Retell POST /create-conversation-flow (400): schema validation error'),
    );

    const res = await POST(makeRequest({ action: 'enable', group: 'PATIENT_CARE' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Failed to deploy outbound agent');
    expect(prisma.outboundSettings.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid action/group combos', async () => {
    const res = await POST(makeRequest({ action: 'enable', group: 'INVALID' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when session has no user', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockResolvedValueOnce({ user: null });

    const res = await POST(makeRequest({ action: 'disable', group: 'PATIENT_CARE' }));
    expect(res.status).toBe(401);
  });

  describe('setChannelDefaults', () => {
    it('merges new channel defaults with existing ones', async () => {
      const { prisma } = require('@kit/prisma');
      prisma.outboundSettings.findUnique.mockResolvedValueOnce({
        accountId: 'acc-1',
        channelDefaults: { recall: 'phone', reminder: 'sms' },
      });

      const res = await POST(makeRequest({
        action: 'setChannelDefaults',
        channelDefaults: { recall: 'email' },
      }));

      expect(res.status).toBe(200);
      expect(prisma.outboundSettings.update).toHaveBeenCalledWith({
        where: { accountId: 'acc-1' },
        data: { channelDefaults: { recall: 'email', reminder: 'sms' } },
      });
    });

    it('accepts none as a valid channel', async () => {
      const { prisma } = require('@kit/prisma');
      prisma.outboundSettings.findUnique.mockResolvedValueOnce({
        accountId: 'acc-1',
        channelDefaults: { recall: 'phone' },
      });

      const res = await POST(makeRequest({
        action: 'setChannelDefaults',
        channelDefaults: { recall: 'none' },
      }));

      expect(res.status).toBe(200);
      expect(prisma.outboundSettings.update).toHaveBeenCalledWith({
        where: { accountId: 'acc-1' },
        data: { channelDefaults: { recall: 'none' } },
      });
    });

    it('rejects invalid channel values', async () => {
      const { prisma } = require('@kit/prisma');
      prisma.outboundSettings.findUnique.mockResolvedValueOnce({
        accountId: 'acc-1',
        channelDefaults: { recall: 'phone' },
      });

      const res = await POST(makeRequest({
        action: 'setChannelDefaults',
        channelDefaults: { recall: 'carrier_pigeon' },
      }));

      expect(res.status).toBe(200);
      expect(prisma.outboundSettings.update).toHaveBeenCalledWith({
        where: { accountId: 'acc-1' },
        data: { channelDefaults: { recall: 'phone' } },
      });
    });

    it('returns 400 when channelDefaults is missing', async () => {
      const res = await POST(makeRequest({ action: 'setChannelDefaults' }));
      expect(res.status).toBe(400);
    });
  });
});
