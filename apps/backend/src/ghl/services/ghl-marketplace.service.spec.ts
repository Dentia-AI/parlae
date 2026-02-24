import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GhlMarketplaceService } from './ghl-marketplace.service';

describe('GhlMarketplaceService', () => {
  let service: GhlMarketplaceService;

  beforeEach(async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GhlMarketplaceService,
        { provide: ConfigService, useValue: { get: jest.fn((k: string) => k === 'GHL_API_KEY' ? '' : undefined) } },
      ],
    }).compile();

    service = module.get<GhlMarketplaceService>(GhlMarketplaceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('browseMarketplace', () => {
    it('should return mock agents when no API key', async () => {
      const agents = await service.browseMarketplace();
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should filter by category', async () => {
      const agents = await service.browseMarketplace({ category: 'Healthcare' });
      expect(agents.every(a => a.category === 'Healthcare')).toBe(true);
    });

    it('should filter by search term', async () => {
      const agents = await service.browseMarketplace({ search: 'appointment' });
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should filter by minRating', async () => {
      const agents = await service.browseMarketplace({ minRating: 4.8 });
      expect(agents.every(a => a.rating >= 4.8)).toBe(true);
    });
  });

  describe('getMarketplaceAgent', () => {
    it('should return agent by ID', async () => {
      const agent = await service.getMarketplaceAgent('appointment-booker-pro');
      expect(agent).not.toBeNull();
      expect(agent!.id).toBe('appointment-booker-pro');
    });

    it('should return null for unknown agent', async () => {
      const agent = await service.getMarketplaceAgent('nonexistent');
      expect(agent).toBeNull();
    });
  });

  describe('installMarketplaceAgent', () => {
    it('should return mock installation when API unavailable', async () => {
      const result = await service.installMarketplaceAgent('loc-1', {
        marketplaceAgentId: 'appointment-booker-pro',
      });
      expect(result).toBeDefined();
      expect(result.name).toBe('Appointment Booker Pro');
    });

    it('should throw for unknown agent', async () => {
      await expect(
        service.installMarketplaceAgent('loc-1', { marketplaceAgentId: 'nonexistent' }),
      ).rejects.toThrow('Marketplace agent not found');
    });
  });

  describe('getMarketplaceCategories', () => {
    it('should return unique categories', async () => {
      const categories = await service.getMarketplaceCategories();
      expect(categories.length).toBeGreaterThan(0);
      expect(new Set(categories).size).toBe(categories.length);
    });
  });
});
