import { POST } from '../route';
import { NextRequest } from 'next/server';

jest.mock('~/lib/auth/get-session', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

jest.mock('~/lib/auth/is-admin', () => ({
  isAdmin: jest.fn().mockResolvedValue(false),
}));

jest.mock('@kit/prisma', () => ({
  prisma: {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-1' }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'acc-1',
        name: 'Test Clinic',
        brandingBusinessName: 'Test Dental',
        brandingContactEmail: null,
        brandingContactPhone: null,
        brandingAddress: null,
        brandingWebsite: null,
        brandingTimezone: null,
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

jest.mock('@kit/shared/voice-provider', () => ({
  getAccountProvider: jest.fn().mockReturnValue('retell'),
}));

jest.mock('@kit/shared/scraper/website-scraper', () => ({
  scrapeWebsite: jest.fn().mockResolvedValue({
    content: 'Welcome to Test Dental. We offer cleanings, fillings, and crowns.',
    pages: [{ url: 'https://example.com', content: 'Welcome', title: 'Home' }],
  }),
}));

jest.mock('@kit/shared/scraper/categorize-content', () => ({
  categorizeContent: jest.fn().mockResolvedValue({
    general: 'We are a dental clinic.',
    services: 'Cleanings, fillings, crowns.',
  }),
  KB_CATEGORIES: ['general', 'services', 'faq', 'policies', 'insurance', 'contact'],
}));

jest.mock('@kit/shared/scraper/extract-clinic-info', () => ({
  extractClinicInfo: jest.fn().mockResolvedValue({
    businessName: 'Test Dental',
    phone: '+15551234567',
    address: '123 Main St',
  }),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/agent/knowledge/scrape', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/agent/knowledge/scrape', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 400 when websiteUrl is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid URL', async () => {
    const res = await POST(makeRequest({ websiteUrl: 'not-a-url' }));
    expect(res.status).toBe(400);
  });

  it('returns error when no session', async () => {
    const { requireSession } = require('~/lib/auth/get-session');
    requireSession.mockRejectedValueOnce(new Error('Unauthorized'));

    const res = await POST(makeRequest({ websiteUrl: 'https://example.com' }));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 403 when non-admin uses accountId', async () => {
    const res = await POST(makeRequest({
      websiteUrl: 'https://example.com',
      accountId: 'other-acc',
    }));
    expect(res.status).toBe(403);
  });
});
