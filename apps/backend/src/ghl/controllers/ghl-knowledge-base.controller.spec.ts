import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlKnowledgeBaseController } from './ghl-knowledge-base.controller';
import { GhlKnowledgeBaseService } from '../services/ghl-knowledge-base.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DevAuthGuard } from '../../auth/dev-auth.guard';
import { CognitoJwtVerifierService } from '../../auth/cognito-jwt-verifier.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('GhlKnowledgeBaseController', () => {
  let controller: GhlKnowledgeBaseController;
  let service: any;
  let prisma: any;

  const mockReq = { user: { id: 'u-1' } };

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const mockService = {
      createKnowledgeBase: jest.fn().mockResolvedValue({ id: 'kb-1', title: 'FAQ' }),
      getKnowledgeBaseByVoiceAgent: jest.fn().mockResolvedValue([{ id: 'kb-1' }]),
      getKnowledgeBaseById: jest.fn().mockResolvedValue({
        id: 'kb-1',
        voiceAgent: { subAccount: { userId: 'u-1' } },
      }),
      deleteKnowledgeBase: jest.fn().mockResolvedValue({ id: 'kb-1' }),
      uploadToGhl: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GhlKnowledgeBaseController],
      providers: [
        { provide: GhlKnowledgeBaseService, useValue: mockService },
        { provide: PrismaService, useValue: mockPrisma },
        DevAuthGuard,
        { provide: CognitoJwtVerifierService, useValue: { verifyToken: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<GhlKnowledgeBaseController>(GhlKnowledgeBaseController);
    service = module.get(GhlKnowledgeBaseService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => { expect(controller).toBeDefined(); });

  describe('createKnowledgeBase', () => {
    it('should create knowledge base entry', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'u-1' },
      });
      const result = await controller.createKnowledgeBase(
        { voiceAgentId: 'va-1', title: 'FAQ', content: 'Content', source: 'TEXT' as any },
        mockReq,
      );
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('kb-1');
    });

    it('should throw forbidden for wrong user', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'other' },
      });
      await expect(
        controller.createKnowledgeBase(
          { voiceAgentId: 'va-1', title: 'FAQ', content: 'Content', source: 'TEXT' as any },
          mockReq,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw forbidden when voice agent not found', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue(null);
      await expect(
        controller.createKnowledgeBase(
          { voiceAgentId: 'va-missing', title: 'FAQ', content: 'Content', source: 'TEXT' as any },
          mockReq,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw 500 when service throws non-HttpException', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'u-1' },
      });
      service.createKnowledgeBase.mockRejectedValue(new Error('DB error'));
      await expect(
        controller.createKnowledgeBase(
          { voiceAgentId: 'va-1', title: 'FAQ', content: 'Content', source: 'TEXT' as any },
          mockReq,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getKnowledgeBaseByVoiceAgent', () => {
    it('should return knowledge bases', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'u-1' },
      });
      const result = await controller.getKnowledgeBaseByVoiceAgent('va-1', mockReq);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });

    it('should throw forbidden when voice agent not found', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue(null);
      await expect(
        controller.getKnowledgeBaseByVoiceAgent('va-missing', mockReq),
      ).rejects.toThrow(HttpException);
    });

    it('should throw forbidden for wrong user', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'other' },
      });
      await expect(
        controller.getKnowledgeBaseByVoiceAgent('va-1', mockReq),
      ).rejects.toThrow(HttpException);
    });

    it('should throw 500 when service throws non-HttpException', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'u-1' },
      });
      service.getKnowledgeBaseByVoiceAgent.mockRejectedValue(new Error('DB error'));
      await expect(
        controller.getKnowledgeBaseByVoiceAgent('va-1', mockReq),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('deleteKnowledgeBase', () => {
    it('should delete knowledge base', async () => {
      const result = await controller.deleteKnowledgeBase('kb-1', mockReq);
      expect(result.success).toBe(true);
    });

    it('should throw forbidden for wrong user', async () => {
      service.getKnowledgeBaseById.mockResolvedValue({
        id: 'kb-1',
        voiceAgent: { subAccount: { userId: 'other' } },
      });
      await expect(controller.deleteKnowledgeBase('kb-1', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw forbidden when knowledge base not found', async () => {
      service.getKnowledgeBaseById.mockResolvedValue(null);
      await expect(controller.deleteKnowledgeBase('kb-missing', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw 500 when service throws non-HttpException', async () => {
      service.getKnowledgeBaseById.mockResolvedValue({
        id: 'kb-1',
        voiceAgent: { subAccount: { userId: 'u-1' } },
      });
      service.deleteKnowledgeBase.mockRejectedValue(new Error('DB error'));
      await expect(controller.deleteKnowledgeBase('kb-1', mockReq)).rejects.toThrow(HttpException);
    });
  });

  describe('uploadKnowledgeBaseToGhl', () => {
    it('should upload to GHL', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'u-1' },
      });
      const result = await controller.uploadKnowledgeBaseToGhl('va-1', mockReq);
      expect(result.success).toBe(true);
    });

    it('should throw when upload fails', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'u-1' },
      });
      service.uploadToGhl.mockResolvedValue(false);
      await expect(controller.uploadKnowledgeBaseToGhl('va-1', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw forbidden when voice agent not found', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue(null);
      await expect(controller.uploadKnowledgeBaseToGhl('va-missing', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw forbidden for wrong user', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'other' },
      });
      await expect(controller.uploadKnowledgeBaseToGhl('va-1', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw 500 when service throws non-HttpException', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'u-1' },
      });
      service.uploadToGhl.mockRejectedValue(new Error('API error'));
      await expect(controller.uploadKnowledgeBaseToGhl('va-1', mockReq)).rejects.toThrow(HttpException);
    });
  });

  describe('error response details', () => {
    it('should throw 500 with correct message when createKnowledgeBase fails', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'u-1' },
      });
      service.createKnowledgeBase.mockRejectedValue(new Error('DB error'));
      try {
        await controller.createKnowledgeBase(
          { voiceAgentId: 'va-1', title: 'FAQ', content: 'Content', source: 'TEXT' as any },
          mockReq,
        );
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect((e as HttpException).getResponse()).toBe('Failed to create knowledge base');
      }
    });

    it('should throw 500 with correct message when getKnowledgeBaseByVoiceAgent fails', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'u-1' },
      });
      service.getKnowledgeBaseByVoiceAgent.mockRejectedValue(new Error('DB error'));
      try {
        await controller.getKnowledgeBaseByVoiceAgent('va-1', mockReq);
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect((e as HttpException).getResponse()).toBe('Failed to fetch knowledge base');
      }
    });

    it('should throw 500 with correct message when deleteKnowledgeBase fails', async () => {
      service.getKnowledgeBaseById.mockResolvedValue({
        id: 'kb-1',
        voiceAgent: { subAccount: { userId: 'u-1' } },
      });
      service.deleteKnowledgeBase.mockRejectedValue(new Error('DB error'));
      try {
        await controller.deleteKnowledgeBase('kb-1', mockReq);
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect((e as HttpException).getResponse()).toBe('Failed to delete knowledge base');
      }
    });

    it('should throw 500 with correct message when uploadKnowledgeBaseToGhl fails', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'u-1' },
      });
      service.uploadToGhl.mockRejectedValue(new Error('API error'));
      try {
        await controller.uploadKnowledgeBaseToGhl('va-1', mockReq);
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect((e as HttpException).getResponse()).toBe('Failed to upload knowledge base');
      }
    });

    it('should throw 403 FORBIDDEN for unauthorized create', async () => {
      prisma.voiceAgent.findUnique.mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'other' },
      });
      try {
        await controller.createKnowledgeBase(
          { voiceAgentId: 'va-1', title: 'FAQ', content: 'Content', source: 'TEXT' as any },
          mockReq,
        );
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });
  });
});
