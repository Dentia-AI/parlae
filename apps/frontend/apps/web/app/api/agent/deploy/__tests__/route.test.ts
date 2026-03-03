import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('@kit/shared/auth/nextauth', () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
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
    const { auth } = require('@kit/shared/auth/nextauth');
    auth.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ voice: { voiceId: 'v1' } }));
    expect(res.status).toBe(401);
  });
});
