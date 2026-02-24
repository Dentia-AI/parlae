import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GhlVoiceAgentService } from './ghl-voice-agent.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('GhlVoiceAgentService', () => {
  let service: GhlVoiceAgentService;
  let prisma: any;

  beforeEach(async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GhlVoiceAgentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: { get: jest.fn(() => '') } },
      ],
    }).compile();

    service = module.get<GhlVoiceAgentService>(GhlVoiceAgentService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('createVoiceAgent', () => {
    it('should create voice agent with defaults', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue({ id: 'sa-1', businessName: 'Test Clinic', timezone: 'America/New_York' });
      prisma.voiceAgent.create.mockResolvedValue({ id: 'va-1', name: 'Test Agent', status: 'DRAFT' });

      const result = await service.createVoiceAgent('sa-1', { name: 'Test Agent', voiceId: 'nova' });
      expect(result.id).toBe('va-1');
      expect(prisma.voiceAgent.create).toHaveBeenCalled();
    });

    it('should throw when sub-account not found', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue(null);
      await expect(service.createVoiceAgent('missing', { name: 'Test', voiceId: 'nova' }))
        .rejects.toThrow('Sub-account not found');
    });
  });

  describe('deployVoiceAgent', () => {
    it('should throw when agent not found', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue(null);
      await expect(service.deployVoiceAgent('missing')).rejects.toThrow('Voice agent not found');
    });

    it('should throw when GHL API fails', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        name: 'Test',
        subAccount: { ghlLocationId: 'loc-1' },
      });
      await expect(service.deployVoiceAgent('va-1')).rejects.toThrow('Failed to create agent in GHL');
    });
  });

  describe('getVoiceAgent', () => {
    it('should return agent', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({ id: 'va-1' });
      const result = await service.getVoiceAgent('va-1');
      expect(result).toEqual({ id: 'va-1' });
    });
  });

  describe('getVoiceAgentsBySubAccount', () => {
    it('should return agents for sub-account', async () => {
      prisma.voiceAgent.findMany.mockResolvedValue([{ id: 'va-1' }]);
      const result = await service.getVoiceAgentsBySubAccount('sa-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('updateVoiceAgent', () => {
    it('should update agent fields', async () => {
      prisma.voiceAgent.update.mockResolvedValue({ id: 'va-1', name: 'Updated' });
      const result = await service.updateVoiceAgent('va-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  describe('pauseVoiceAgent', () => {
    it('should pause agent', async () => {
      prisma.voiceAgent.update.mockResolvedValue({ id: 'va-1', status: 'PAUSED' });
      const result = await service.pauseVoiceAgent('va-1');
      expect(result.status).toBe('PAUSED');
    });
  });

  describe('activateVoiceAgent', () => {
    it('should activate agent', async () => {
      prisma.voiceAgent.update.mockResolvedValue({ id: 'va-1', status: 'ACTIVE' });
      const result = await service.activateVoiceAgent('va-1');
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('deleteVoiceAgent', () => {
    it('should archive agent', async () => {
      prisma.voiceAgent.update.mockResolvedValue({ id: 'va-1', status: 'ARCHIVED' });
      const result = await service.deleteVoiceAgent('va-1');
      expect(result.status).toBe('ARCHIVED');
    });
  });
});
