import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GhlMarketplaceController } from './ghl-marketplace.controller';
import { GhlMarketplaceService } from '../services/ghl-marketplace.service';
import { DevAuthGuard } from '../../auth/dev-auth.guard';
import { CognitoAuthGuard } from '../../auth/cognito-auth.guard';
import { CognitoJwtVerifierService } from '../../auth/cognito-jwt-verifier.service';

describe('GhlMarketplaceController', () => {
  let controller: GhlMarketplaceController;
  let service: any;

  beforeEach(async () => {
    const mockService = {
      browseMarketplace: jest.fn().mockResolvedValue([{ id: 'agent-1', name: 'Agent 1' }]),
      getMarketplaceAgent: jest.fn().mockResolvedValue({ id: 'agent-1', name: 'Agent 1' }),
      getMarketplaceCategories: jest.fn().mockResolvedValue(['Healthcare', 'Dental']),
      installMarketplaceAgent: jest.fn().mockResolvedValue({ id: 'installed-1', name: 'Agent 1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GhlMarketplaceController],
      providers: [
        { provide: GhlMarketplaceService, useValue: mockService },
        DevAuthGuard,
        CognitoAuthGuard,
        { provide: CognitoJwtVerifierService, useValue: { verifyToken: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<GhlMarketplaceController>(GhlMarketplaceController);
    service = module.get(GhlMarketplaceService);
  });

  it('should be defined', () => { expect(controller).toBeDefined(); });

  describe('browseMarketplace', () => {
    it('should return agents list', async () => {
      const result = await controller.browseMarketplace();
      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should pass filters to service', async () => {
      await controller.browseMarketplace('Healthcare', 'test', '4.5');
      expect(service.browseMarketplace).toHaveBeenCalledWith({
        category: 'Healthcare',
        search: 'test',
        minRating: 4.5,
      });
    });
  });

  describe('getMarketplaceAgent', () => {
    it('should return agent details', async () => {
      const result = await controller.getMarketplaceAgent('agent-1');
      expect(result.success).toBe(true);
      expect(result.agent!.id).toBe('agent-1');
    });

    it('should return not found for null agent', async () => {
      service.getMarketplaceAgent.mockResolvedValue(null);
      const result = await controller.getMarketplaceAgent('missing');
      expect(result.success).toBe(false);
    });
  });

  describe('getCategories', () => {
    it('should return categories', async () => {
      const result = await controller.getCategories();
      expect(result.success).toBe(true);
      expect(result.categories).toHaveLength(2);
    });
  });

  describe('installAgent', () => {
    it('should install marketplace agent', async () => {
      const result = await controller.installAgent({
        locationId: 'loc-1',
        marketplaceAgentId: 'agent-1',
      });
      expect(result.success).toBe(true);
      expect(service.installMarketplaceAgent).toHaveBeenCalledWith('loc-1', expect.objectContaining({
        marketplaceAgentId: 'agent-1',
      }));
    });
  });
});
