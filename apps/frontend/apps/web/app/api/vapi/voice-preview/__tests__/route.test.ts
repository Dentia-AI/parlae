import { POST } from '../route';

jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('POST /api/vapi/voice-preview', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new ArrayBuffer(100),
    });
  });
  afterEach(() => jest.clearAllMocks());

  it('should generate voice preview', async () => {
    const request = new Request('http://localhost/api/vapi/voice-preview', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello', voiceId: 'nova', provider: 'openai' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
