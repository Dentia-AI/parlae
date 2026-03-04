import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GhlPhoneService } from './ghl-phone.service';

describe('GhlPhoneService', () => {
  let service: GhlPhoneService;

  beforeEach(async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GhlPhoneService,
        { provide: ConfigService, useValue: { get: jest.fn(() => '') } },
      ],
    }).compile();
    service = module.get<GhlPhoneService>(GhlPhoneService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('getAvailablePhoneNumbers', () => {
    it('should return mock numbers when no API key', async () => {
      const numbers = await service.getAvailablePhoneNumbers();
      expect(numbers.length).toBe(5);
    });

    it('should filter by areaCode', async () => {
      const numbers = await service.getAvailablePhoneNumbers('555');
      expect(numbers.every((n) => n.areaCode === '555')).toBe(true);
    });

    it('should filter by state', async () => {
      const numbers = await service.getAvailablePhoneNumbers(undefined, 'NY');
      expect(numbers.every((n) => n.state === 'NY')).toBe(true);
    });

    it('should return GHL numbers when API returns data', async () => {
      const ghlNumbers = [
        { phoneNumber: '+15551234567', friendlyName: 'GHL', areaCode: '555', country: 'US', capabilities: { voice: true, sms: true }, available: true },
      ];
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ phoneNumbers: ghlNumbers }),
      });
      const module = await Test.createTestingModule({
        providers: [
          GhlPhoneService,
          { provide: ConfigService, useValue: { get: jest.fn((k: string) => (k === 'GHL_API_KEY' ? 'key' : k === 'GHL_BASE_URL' ? 'https://api.test' : '')) } },
        ],
      }).compile();
      const svc = module.get<GhlPhoneService>(GhlPhoneService);
      const numbers = await svc.getAvailablePhoneNumbers();
      expect(numbers).toEqual(ghlNumbers);
    });

    it('should pass areaCode and state to GHL API when both provided', async () => {
      const ghlNumbers = [
        { phoneNumber: '+15551234567', friendlyName: 'GHL', areaCode: '415', country: 'US', capabilities: { voice: true, sms: true }, available: true },
      ];
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ phoneNumbers: ghlNumbers }),
      });
      const module = await Test.createTestingModule({
        providers: [
          GhlPhoneService,
          { provide: ConfigService, useValue: { get: jest.fn((k: string) => (k === 'GHL_API_KEY' ? 'key' : k === 'GHL_BASE_URL' ? 'https://api.test' : '')) } },
        ],
      }).compile();
      const svc = module.get<GhlPhoneService>(GhlPhoneService);
      await svc.getAvailablePhoneNumbers('415', 'CA');
      const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(fetchUrl).toContain('areaCode=415');
      expect(fetchUrl).toContain('state=CA');
    });

    it('should fallback to mock when fetch throws', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      const numbers = await service.getAvailablePhoneNumbers();
      expect(numbers.length).toBe(5);
    });
  });

  describe('searchByAreaCode', () => {
    it('should delegate to getAvailablePhoneNumbers', async () => {
      const numbers = await service.searchByAreaCode('555');
      expect(numbers.length).toBeGreaterThan(0);
    });
  });

  describe('searchByState', () => {
    it('should delegate to getAvailablePhoneNumbers', async () => {
      const numbers = await service.searchByState('CA');
      expect(numbers.length).toBeGreaterThan(0);
    });
  });

  describe('assignPhoneNumber', () => {
    it('should return false when API call fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
      const result = await service.assignPhoneNumber('+15551234567', 'agent-1');
      expect(result).toBe(false);
    });

    it('should return true when API call succeeds', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const result = await service.assignPhoneNumber('+15551234567', 'agent-1');
      expect(result).toBe(true);
    });

    it('should return false when fetch throws', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      const result = await service.assignPhoneNumber('+15551234567', 'agent-1');
      expect(result).toBe(false);
    });
  });

  describe('fetchPhoneNumbersFromGhl (via getAvailablePhoneNumbers)', () => {
    it('should fallback to mock when GHL returns empty array', async () => {
      const module = await Test.createTestingModule({
        providers: [
          GhlPhoneService,
          { provide: ConfigService, useValue: { get: jest.fn((k: string) => (k === 'GHL_API_KEY' ? 'key' : k === 'GHL_BASE_URL' ? 'https://api.test' : '')) } },
        ],
      }).compile();
      const svc = module.get<GhlPhoneService>(GhlPhoneService);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ phoneNumbers: [] }),
      });
      const numbers = await svc.getAvailablePhoneNumbers();
      expect(numbers.length).toBe(5);
      expect(numbers.every((n) => n.areaCode === '555')).toBe(true);
    });

    it('should fallback to mock when GHL response has no phoneNumbers key', async () => {
      const module = await Test.createTestingModule({
        providers: [
          GhlPhoneService,
          { provide: ConfigService, useValue: { get: jest.fn((k: string) => (k === 'GHL_API_KEY' ? 'key' : k === 'GHL_BASE_URL' ? 'https://api.test' : '')) } },
        ],
      }).compile();
      const svc = module.get<GhlPhoneService>(GhlPhoneService);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ error: 'No numbers' }),
      });
      const numbers = await svc.getAvailablePhoneNumbers();
      expect(numbers.length).toBe(5);
    });

    it('should fallback to mock when GHL API returns not ok', async () => {
      const module = await Test.createTestingModule({
        providers: [
          GhlPhoneService,
          { provide: ConfigService, useValue: { get: jest.fn((k: string) => (k === 'GHL_API_KEY' ? 'key' : k === 'GHL_BASE_URL' ? 'https://api.test' : '')) } },
        ],
      }).compile();
      const svc = module.get<GhlPhoneService>(GhlPhoneService);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });
      const numbers = await svc.getAvailablePhoneNumbers();
      expect(numbers.length).toBe(5);
    });

    it('should apply both areaCode and state filters when using mock', async () => {
      const numbers = await service.getAvailablePhoneNumbers('555', 'NY');
      expect(numbers.every((n) => n.areaCode === '555' && n.state === 'NY')).toBe(true);
      expect(numbers.length).toBe(1);
    });

    it('should return empty array when filters match no mock numbers', async () => {
      const numbers = await service.getAvailablePhoneNumbers('999', 'XX');
      expect(numbers).toEqual([]);
    });

    it('should return mock numbers when getAvailablePhoneNumbers throws (outer catch)', async () => {
      jest.spyOn(service['logger'], 'log').mockImplementationOnce(() => {
        throw new Error('Logger failed');
      });
      const numbers = await service.getAvailablePhoneNumbers();
      expect(numbers.length).toBe(5);
    });

    it('should hit fetchPhoneNumbersFromGhl catch when fetch throws with API key', async () => {
      const module = await Test.createTestingModule({
        providers: [
          GhlPhoneService,
          { provide: ConfigService, useValue: { get: jest.fn((k: string) => (k === 'GHL_API_KEY' ? 'key' : k === 'GHL_BASE_URL' ? 'https://api.test' : '')) } },
        ],
      }).compile();
      const svc = module.get<GhlPhoneService>(GhlPhoneService);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      const numbers = await svc.getAvailablePhoneNumbers();
      expect(numbers.length).toBe(5);
    });

    it('should hit fetchPhoneNumbersFromGhl catch when response.json throws', async () => {
      const module = await Test.createTestingModule({
        providers: [
          GhlPhoneService,
          { provide: ConfigService, useValue: { get: jest.fn((k: string) => (k === 'GHL_API_KEY' ? 'key' : k === 'GHL_BASE_URL' ? 'https://api.test' : '')) } },
        ],
      }).compile();
      const svc = module.get<GhlPhoneService>(GhlPhoneService);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });
      const numbers = await svc.getAvailablePhoneNumbers();
      expect(numbers.length).toBe(5);
    });

    it('should use custom GHL_BASE_URL in assignPhoneNumber', async () => {
      const customUrl = 'https://custom.ghl.api';
      const module = await Test.createTestingModule({
        providers: [
          GhlPhoneService,
          { provide: ConfigService, useValue: { get: jest.fn((k: string) => (k === 'GHL_API_KEY' ? 'key' : k === 'GHL_BASE_URL' ? customUrl : '')) } },
        ],
      }).compile();
      const svc = module.get<GhlPhoneService>(GhlPhoneService);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      await svc.assignPhoneNumber('+15551234567', 'agent-1');
      expect(global.fetch).toHaveBeenCalledWith(
        `${customUrl}/phone-numbers/assign`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ phoneNumber: '+15551234567', agentId: 'agent-1' }),
        }),
      );
    });
  });
});
