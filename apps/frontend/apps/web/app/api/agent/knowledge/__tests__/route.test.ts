import { GET, PUT } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'acc-1',
        phoneIntegrationSettings: {
          knowledgeBaseConfig: { general: ['file-1'] },
          knowledgeBaseFileIds: ['file-1'],
          queryToolId: 'qt-1',
          websiteScrapedUrl: 'https://example.com',
        },
        brandingBusinessName: 'Test Dental',
        name: 'Test Dental',
        paymentMethodVerified: true,
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

jest.mock('@kit/shared/voice-provider', () => ({
  getAccountProvider: jest.fn().mockReturnValue('retell'),
}));

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: jest.fn((fn: () => void) => fn) };
});

describe('GET /api/agent/knowledge', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns KB config from account', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.businessName).toBe('Test Dental');
    expect(body.knowledgeBaseConfig).toEqual({ general: ['file-1'] });
    expect(body.queryToolId).toBe('qt-1');
  });

  it('returns 404 when account not found', async () => {
    const { prisma } = require('@kit/prisma');
    prisma.account.findFirst.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns error when no session', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockRejectedValueOnce(new Error('Unauthorized'));

    const res = await GET();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('PUT /api/agent/knowledge', () => {
  afterEach(() => jest.clearAllMocks());

  it('saves KB config and returns success', async () => {
    const { prisma } = require('@kit/prisma');
    const req = new NextRequest('http://localhost/api/agent/knowledge', {
      method: 'PUT',
      body: JSON.stringify({
        knowledgeBaseConfig: { general: ['file-2'] },
        websiteUrl: 'https://example.com',
      }),
    });
    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.account.update).toHaveBeenCalled();
  });
});
