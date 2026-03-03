import { GET } from '../route';

jest.mock('@kit/shared/twilio/server', () => ({
  createTwilioService: jest.fn().mockReturnValue({
    isEnabled: () => true,
    listNumbers: jest.fn().mockResolvedValue([
      { phoneNumber: '+14155551234', sid: 'PN123' },
    ]),
  }),
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

describe('GET /api/twilio/phone/list', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns purchased numbers', async () => {
    const res = await GET(new Request('http://localhost/api/twilio/phone/list'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.numbers).toHaveLength(1);
  });

  it('passes subAccountSid when provided', async () => {
    const { createTwilioService } = require('@kit/shared/twilio/server');
    const mockList = jest.fn().mockResolvedValue([]);
    createTwilioService.mockReturnValueOnce({ isEnabled: () => true, listNumbers: mockList });

    await GET(new Request('http://localhost/api/twilio/phone/list?subAccountSid=AC123'));

    expect(mockList).toHaveBeenCalledWith('AC123');
  });

  it('returns empty when twilio not enabled', async () => {
    const { createTwilioService } = require('@kit/shared/twilio/server');
    createTwilioService.mockReturnValueOnce({ isEnabled: () => false });

    const res = await GET(new Request('http://localhost/api/twilio/phone/list'));
    const body = await res.json();

    expect(body.numbers).toHaveLength(0);
  });
});
