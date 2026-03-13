import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    retellPhoneNumber: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    retellAgentTemplate: {
      findFirst: jest.fn(),
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
    importPhoneNumber: jest.fn().mockResolvedValue({ phone_number: '+15551234567' }),
  }),
}));

jest.mock('@kit/shared/retell/templates/retell-template-utils', () => ({
  deployRetellSquad: jest.fn().mockResolvedValue({
    version: 'v1.0',
    agents: {
      receptionist: { agentId: 'agent-new-r', llmId: 'llm-r' },
      booking: { agentId: 'agent-new-b', llmId: 'llm-b' },
      appointmentMgmt: { agentId: 'agent-new-a', llmId: 'llm-a' },
      patientRecords: { agentId: 'agent-new-p', llmId: 'llm-p' },
      insuranceBilling: { agentId: 'agent-new-i', llmId: 'llm-i' },
      emergency: { agentId: 'agent-new-e', llmId: 'llm-e' },
    },
  }),
  teardownRetellSquad: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@kit/shared/retell/retell-kb.service', () => ({
  ensureRetellKnowledgeBase: jest.fn().mockResolvedValue(null),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/retell-deploy', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function resetPrismaMocks() {
  const { prisma } = require('@kit/prisma');
  prisma.account.findUnique.mockReset().mockResolvedValue({
    id: 'acc-1',
    name: 'Test Clinic',
    brandingBusinessName: 'Test Clinic',
    brandingContactPhone: '+15559999999',
    phoneIntegrationSettings: {},
    retellPhoneNumbers: [],
  });
  prisma.account.update.mockReset().mockResolvedValue({ id: 'acc-1' });
  prisma.retellPhoneNumber.upsert.mockReset().mockResolvedValue({ id: 'rpn-1' });
  prisma.retellPhoneNumber.updateMany.mockReset().mockResolvedValue({ count: 0 });
  prisma.retellAgentTemplate.findFirst.mockReset().mockResolvedValue({ id: 'tpl-default' });
}

describe('POST /api/admin/retell-deploy — 1:1 agent-account invariant', () => {
  beforeEach(() => resetPrismaMocks());

  it('returns 400 when accountId is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when account does not exist', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ accountId: 'bad' }));
    expect(res.status).toBe(404);
  });

  it('saves retellPhoneNumber with accountId in both create and update blocks', async () => {
    const { prisma } = require('@kit/prisma');
    const res = await POST(makeRequest({ accountId: 'acc-1', phoneNumber: '+15551234567' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    expect(prisma.retellPhoneNumber.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ accountId: 'acc-1', isActive: true }),
        update: expect.objectContaining({ accountId: 'acc-1', isActive: true }),
      }),
    );
  });

  it('deactivates stale retellPhoneNumber records for the account before upserting', async () => {
    const { prisma } = require('@kit/prisma');
    const res = await POST(makeRequest({ accountId: 'acc-1', phoneNumber: '+15551234567' }));

    expect(res.status).toBe(200);

    const calls = prisma.retellPhoneNumber.updateMany.mock.calls;
    const deactivateCall = calls.find(
      (c: any) => c[0]?.where?.phoneNumber?.not === '+15551234567' && c[0]?.data?.isActive === false,
    );
    expect(deactivateCall).toBeDefined();
    expect(deactivateCall![0].where.accountId).toBe('acc-1');
  });

  it('deactivation happens before the upsert (order invariant)', async () => {
    const { prisma } = require('@kit/prisma');
    const callOrder: string[] = [];
    prisma.retellPhoneNumber.updateMany.mockImplementation(async (args: any) => {
      if (args.data?.isActive === false) callOrder.push('deactivate');
      return { count: 0 };
    });
    prisma.retellPhoneNumber.upsert.mockImplementation(async () => {
      callOrder.push('upsert');
      return { id: 'rpn-1' };
    });

    const res = await POST(makeRequest({ accountId: 'acc-1', phoneNumber: '+15551234567' }));

    expect(res.status).toBe(200);
    expect(callOrder[0]).toBe('deactivate');
    expect(callOrder[1]).toBe('upsert');
  });

  it('creates placeholder record when no phone number is provided', async () => {
    const { prisma } = require('@kit/prisma');
    const res = await POST(makeRequest({ accountId: 'acc-1' }));

    expect(res.status).toBe(200);

    expect(prisma.retellPhoneNumber.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          accountId: 'acc-1',
          isActive: false,
          phoneNumber: 'retell-pending-acc-1',
        }),
      }),
    );
  });

  it('tears down existing agents before redeploying', async () => {
    const { prisma } = require('@kit/prisma');
    const { teardownRetellSquad } = require('@kit/shared/retell/templates/retell-template-utils');

    prisma.account.findUnique.mockResolvedValueOnce({
      id: 'acc-1',
      name: 'Test Clinic',
      brandingBusinessName: 'Test Clinic',
      brandingContactPhone: null,
      phoneIntegrationSettings: {},
      retellPhoneNumbers: [
        {
          retellAgentIds: {
            receptionist: { agentId: 'old-r', llmId: 'old-lr' },
            booking: { agentId: 'old-b', llmId: 'old-lb' },
          },
        },
      ],
    });

    const res = await POST(makeRequest({ accountId: 'acc-1', phoneNumber: '+15551234567' }));

    expect(res.status).toBe(200);
    expect(teardownRetellSquad).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        receptionist: { agentId: 'old-r', llmId: 'old-lr' },
      }),
    );
  });
});
