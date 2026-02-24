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

    it('should filter by state', async () => {
      const numbers = await service.getAvailablePhoneNumbers(undefined, 'NY');
      expect(numbers.every(n => n.state === 'NY')).toBe(true);
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
  });
});
