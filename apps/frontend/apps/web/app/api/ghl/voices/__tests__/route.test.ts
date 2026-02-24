import { GET } from '../route';

jest.mock('@kit/shared/gohighlevel/server', () => ({
  createGoHighLevelService: jest.fn().mockReturnValue({
    isEnabled: jest.fn().mockReturnValue(true),
    getVoices: jest.fn().mockResolvedValue([{ id: 'v1', name: 'Voice 1' }]),
  }),
}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('GET /api/ghl/voices', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return voices', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });
});
