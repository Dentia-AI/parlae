import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GhlKnowledgeBaseService } from './ghl-knowledge-base.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('GhlKnowledgeBaseService', () => {
  let service: GhlKnowledgeBaseService;
  let prisma: any;

  beforeEach(async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GhlKnowledgeBaseService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: { get: jest.fn(() => '') } },
      ],
    }).compile();

    service = module.get<GhlKnowledgeBaseService>(GhlKnowledgeBaseService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('createKnowledgeBase', () => {
    it('should create and process a knowledge base entry', async () => {
      const created = { id: 'kb-1', title: 'FAQ', isProcessed: false };
      prisma.knowledgeBase.create.mockResolvedValue(created);
      prisma.knowledgeBase.update.mockResolvedValue({ ...created, isProcessed: true });

      const result = await service.createKnowledgeBase({
        voiceAgentId: 'va-1',
        title: 'FAQ',
        content: 'Some content',
        source: 'TEXT' as any,
      });

      expect(result.id).toBe('kb-1');
      expect(prisma.knowledgeBase.create).toHaveBeenCalled();
      expect(prisma.knowledgeBase.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'kb-1' } }),
      );
    });

    it('should handle processing errors gracefully', async () => {
      prisma.knowledgeBase.create.mockResolvedValue({ id: 'kb-1' });
      prisma.knowledgeBase.update
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockResolvedValueOnce({ id: 'kb-1', processingError: 'Processing failed' });

      const result = await service.createKnowledgeBase({
        voiceAgentId: 'va-1',
        title: 'FAQ',
        content: 'Content',
        source: 'TEXT' as any,
      });

      expect(result.id).toBe('kb-1');
    });
  });

  describe('getKnowledgeBaseByVoiceAgent', () => {
    it('should return knowledge bases for voice agent', async () => {
      prisma.knowledgeBase.findMany.mockResolvedValue([{ id: 'kb-1' }, { id: 'kb-2' }]);
      const result = await service.getKnowledgeBaseByVoiceAgent('va-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('getKnowledgeBaseById', () => {
    it('should return knowledge base with relations', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({
        id: 'kb-1',
        voiceAgent: { subAccount: { id: 'sa-1' } },
      });
      const result = await service.getKnowledgeBaseById('kb-1');
      expect(result!.id).toBe('kb-1');
    });
  });

  describe('updateKnowledgeBase', () => {
    it('should update knowledge base fields', async () => {
      prisma.knowledgeBase.update.mockResolvedValue({ id: 'kb-1', title: 'Updated FAQ' });
      const result = await service.updateKnowledgeBase('kb-1', { title: 'Updated FAQ' });
      expect(result.title).toBe('Updated FAQ');
    });
  });

  describe('deleteKnowledgeBase', () => {
    it('should delete without GHL call when no ghlResourceId', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({ id: 'kb-1', ghlResourceId: null });
      prisma.knowledgeBase.delete.mockResolvedValue({ id: 'kb-1' });

      const result = await service.deleteKnowledgeBase('kb-1');
      expect(result.id).toBe('kb-1');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should call GHL delete when ghlResourceId exists', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      prisma.knowledgeBase.findUnique.mockResolvedValue({ id: 'kb-1', ghlResourceId: 'ghl-res-1' });
      prisma.knowledgeBase.delete.mockResolvedValue({ id: 'kb-1' });

      const result = await service.deleteKnowledgeBase('kb-1');
      expect(result.id).toBe('kb-1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('ghl-res-1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('uploadToGhl', () => {
    it('should throw when voice agent has no ghlAgentId', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({ id: 'va-1', ghlAgentId: null, knowledgeBase: [] });
      const result = await service.uploadToGhl('va-1');
      expect(result).toBe(false);
    });

    it('should skip unprocessed knowledge bases', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        ghlAgentId: 'ghl-agent-1',
        knowledgeBase: [{ id: 'kb-1', isProcessed: false }],
      });

      const result = await service.uploadToGhl('va-1');
      expect(result).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should upload processed knowledge bases', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ resource: { resourceId: 'res-1' } }),
      });
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        ghlAgentId: 'ghl-agent-1',
        knowledgeBase: [{ id: 'kb-1', isProcessed: true, title: 'FAQ', content: 'Content', source: 'TEXT' }],
      });
      prisma.knowledgeBase.update.mockResolvedValue({});

      const result = await service.uploadToGhl('va-1');
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
