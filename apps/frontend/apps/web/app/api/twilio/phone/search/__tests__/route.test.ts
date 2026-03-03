import { GET } from '../route';

jest.mock('@kit/shared/twilio/server', () => ({
  createTwilioService: jest.fn().mockReturnValue({
    isEnabled: () => true,
    searchAvailableNumbers: jest.fn().mockResolvedValue([
      { phoneNumber: '+14155551234', region: 'CA' },
    ]),
  }),
}));

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

describe('GET /api/twilio/phone/search', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns available numbers with default params', async () => {
    const res = await GET(new Request('http://localhost/api/twilio/phone/search'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.numbers).toHaveLength(1);
  });

  it('passes query params to service', async () => {
    const { createTwilioService } = require('@kit/shared/twilio/server');
    const mockSearch = jest.fn().mockResolvedValue([]);
    createTwilioService.mockReturnValueOnce({ isEnabled: () => true, searchAvailableNumbers: mockSearch });

    await GET(new Request('http://localhost/api/twilio/phone/search?areaCode=416&type=TollFree&limit=5'));

    expect(mockSearch).toHaveBeenCalledWith('US', 'TollFree', expect.objectContaining({ areaCode: '416', limit: 5 }));
  });

  it('returns empty when twilio not enabled', async () => {
    const { createTwilioService } = require('@kit/shared/twilio/server');
    createTwilioService.mockReturnValueOnce({ isEnabled: () => false });

    const res = await GET(new Request('http://localhost/api/twilio/phone/search'));
    const body = await res.json();

    expect(body.numbers).toHaveLength(0);
  });
});
