import { POST } from '../route';

jest.mock('@kit/prisma', () => ({
  prisma: {
    vapiPhoneNumber: { findFirst: jest.fn().mockResolvedValue({ accountId: 'acc-1' }) },
    account: { findUnique: jest.fn().mockResolvedValue({ id: 'acc-1' }) },
    callReference: { create: jest.fn().mockResolvedValue({ id: 'ref-1' }) },
  },
}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('POST /api/vapi/webhook', () => {
  beforeEach(() => {
    delete process.env.VAPI_WEBHOOK_SECRET;
    delete process.env.VAPI_SERVER_SECRET;
  });
  afterEach(() => jest.clearAllMocks());

  it('should handle status-update event', async () => {
    const request = new Request('http://localhost/api/vapi/webhook', {
      method: 'POST',
      body: JSON.stringify({
        message: { type: 'status-update', status: 'in-progress', call: { id: 'call-1' } },
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should handle end-of-call-report', async () => {
    const request = new Request('http://localhost/api/vapi/webhook', {
      method: 'POST',
      body: JSON.stringify({
        message: { type: 'end-of-call-report', call: { id: 'call-1' } },
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
