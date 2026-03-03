import { GET } from '../route';

jest.mock('@kit/shared/auth/nextauth', () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        phoneIntegrationSettings: {
          deploymentStatus: 'completed',
          vapiSquadId: 'squad-1',
          phoneNumber: '+15551234567',
          deploymentStartedAt: '2026-01-15T10:00:00Z',
          deploymentCompletedAt: '2026-01-15T10:02:00Z',
        },
        phoneIntegrationMethod: 'vapi',
      }),
    },
  },
}));

describe('GET /api/agent/deploy-status', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns deployment status from account settings', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('completed');
    expect(body.vapiSquadId).toBe('squad-1');
    expect(body.phoneNumber).toBe('+15551234567');
    expect(body.error).toBeNull();
  });

  it('returns not_started when no deployment data', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce({
      phoneIntegrationSettings: {},
      phoneIntegrationMethod: null,
    });

    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('not_started');
  });

  it('returns 404 when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 401 when no session', async () => {
    const { auth } = require('@kit/shared/auth/nextauth');
    auth.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});
