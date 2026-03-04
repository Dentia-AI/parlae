import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlVoiceAgentController } from './ghl-voice-agent.controller';
import { GhlVoiceAgentService } from '../services/ghl-voice-agent.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DevAuthGuard } from '../../auth/dev-auth.guard';
import { CognitoJwtVerifierService } from '../../auth/cognito-jwt-verifier.service';
import { createMockPrismaService } from '../../test/mocks/prisma.mock';

describe('GhlVoiceAgentController', () => {
  let controller: GhlVoiceAgentController;
  let service: any;
  let prisma: any;

  const mockReq = { user: { id: 'u-1', sub: 'u-1' } };

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const mockService = {
      createVoiceAgent: jest.fn().mockResolvedValue({ id: 'va-1', name: 'Test Agent' }),
      getVoiceAgent: jest.fn().mockResolvedValue({
        id: 'va-1',
        subAccount: { userId: 'u-1' },
      }),
      getVoiceAgentsBySubAccount: jest.fn().mockResolvedValue([{ id: 'va-1' }]),
      updateVoiceAgent: jest.fn().mockResolvedValue({ id: 'va-1', name: 'Updated' }),
      deployVoiceAgent: jest.fn().mockResolvedValue({ id: 'va-1', status: 'DEPLOYED' }),
      pauseVoiceAgent: jest.fn().mockResolvedValue({ id: 'va-1', status: 'PAUSED' }),
      activateVoiceAgent: jest.fn().mockResolvedValue({ id: 'va-1', status: 'ACTIVE' }),
      deleteVoiceAgent: jest.fn().mockResolvedValue({ id: 'va-1', status: 'ARCHIVED' }),
      prisma: mockPrisma,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GhlVoiceAgentController],
      providers: [
        { provide: GhlVoiceAgentService, useValue: mockService },
        DevAuthGuard,
        { provide: CognitoJwtVerifierService, useValue: { verifyToken: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<GhlVoiceAgentController>(GhlVoiceAgentController);
    service = module.get(GhlVoiceAgentService);
    prisma = mockService.prisma;
  });

  it('should be defined', () => { expect(controller).toBeDefined(); });

  describe('createVoiceAgent', () => {
    it('should create voice agent', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue({ id: 'sa-1', userId: 'u-1' });
      const result = await controller.createVoiceAgent(
        { subAccountId: 'sa-1', config: { name: 'Test', voiceId: 'nova' } },
        mockReq,
      );
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('va-1');
    });

    it('should throw forbidden for wrong user', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue({ id: 'sa-1', userId: 'other' });
      await expect(
        controller.createVoiceAgent(
          { subAccountId: 'sa-1', config: { name: 'Test', voiceId: 'nova' } },
          mockReq,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getVoiceAgent', () => {
    it('should return voice agent', async () => {
      const result = await controller.getVoiceAgent('va-1', mockReq);
      expect(result.success).toBe(true);
    });

    it('should throw not found', async () => {
      service.getVoiceAgent.mockResolvedValue(null);
      await expect(controller.getVoiceAgent('missing', mockReq)).rejects.toThrow(HttpException);
    });
  });

  describe('getVoiceAgentsBySubAccount', () => {
    it('should return agents for sub-account', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue({ id: 'sa-1', userId: 'u-1' });
      const result = await controller.getVoiceAgentsBySubAccount('sa-1', mockReq);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });

    it('should throw forbidden when sub-account not found', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue(null);
      await expect(
        controller.getVoiceAgentsBySubAccount('missing', mockReq),
      ).rejects.toThrow(HttpException);
    });

    it('should throw forbidden for wrong user', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue({ id: 'sa-1', userId: 'other' });
      await expect(
        controller.getVoiceAgentsBySubAccount('sa-1', mockReq),
      ).rejects.toThrow(HttpException);
    });

    it('should throw 500 on service error', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue({ id: 'sa-1', userId: 'u-1' });
      service.getVoiceAgentsBySubAccount.mockRejectedValue(new Error('DB error'));
      await expect(
        controller.getVoiceAgentsBySubAccount('sa-1', mockReq),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('updateVoiceAgent', () => {
    it('should update voice agent', async () => {
      const result = await controller.updateVoiceAgent('va-1', { name: 'Updated' }, mockReq);
      expect(result.success).toBe(true);
    });

    it('should throw not found', async () => {
      service.getVoiceAgent.mockResolvedValue(null);
      await expect(
        controller.updateVoiceAgent('missing', { name: 'X' }, mockReq),
      ).rejects.toThrow(HttpException);
    });

    it('should throw forbidden for wrong user', async () => {
      service.getVoiceAgent.mockResolvedValue({ id: 'va-1', subAccount: { userId: 'other' } });
      await expect(
        controller.updateVoiceAgent('va-1', { name: 'X' }, mockReq),
      ).rejects.toThrow(HttpException);
    });

    it('should throw 500 on service error', async () => {
      service.updateVoiceAgent.mockRejectedValue(new Error('fail'));
      await expect(
        controller.updateVoiceAgent('va-1', { name: 'X' }, mockReq),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('deployVoiceAgent', () => {
    it('should deploy voice agent', async () => {
      const result = await controller.deployVoiceAgent('va-1', mockReq);
      expect(result.success).toBe(true);
    });

    it('should throw not found', async () => {
      service.getVoiceAgent.mockResolvedValue(null);
      await expect(controller.deployVoiceAgent('missing', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw forbidden for wrong user', async () => {
      service.getVoiceAgent.mockResolvedValue({ id: 'va-1', subAccount: { userId: 'other' } });
      await expect(controller.deployVoiceAgent('va-1', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw 500 on service error', async () => {
      service.deployVoiceAgent.mockRejectedValue(new Error('deploy fail'));
      await expect(controller.deployVoiceAgent('va-1', mockReq)).rejects.toThrow(HttpException);
    });
  });

  describe('pauseVoiceAgent', () => {
    it('should pause voice agent', async () => {
      const result = await controller.pauseVoiceAgent('va-1', mockReq);
      expect(result.success).toBe(true);
    });

    it('should throw not found', async () => {
      service.getVoiceAgent.mockResolvedValue(null);
      await expect(controller.pauseVoiceAgent('missing', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw forbidden for wrong user', async () => {
      service.getVoiceAgent.mockResolvedValue({ id: 'va-1', subAccount: { userId: 'other' } });
      await expect(controller.pauseVoiceAgent('va-1', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw 500 on service error', async () => {
      service.pauseVoiceAgent.mockRejectedValue(new Error('fail'));
      await expect(controller.pauseVoiceAgent('va-1', mockReq)).rejects.toThrow(HttpException);
    });
  });

  describe('activateVoiceAgent', () => {
    it('should activate voice agent', async () => {
      const result = await controller.activateVoiceAgent('va-1', mockReq);
      expect(result.success).toBe(true);
    });

    it('should throw not found', async () => {
      service.getVoiceAgent.mockResolvedValue(null);
      await expect(controller.activateVoiceAgent('missing', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw forbidden for wrong user', async () => {
      service.getVoiceAgent.mockResolvedValue({ id: 'va-1', subAccount: { userId: 'other' } });
      await expect(controller.activateVoiceAgent('va-1', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw 500 on service error', async () => {
      service.activateVoiceAgent.mockRejectedValue(new Error('fail'));
      await expect(controller.activateVoiceAgent('va-1', mockReq)).rejects.toThrow(HttpException);
    });
  });

  describe('deleteVoiceAgent', () => {
    it('should delete voice agent', async () => {
      const result = await controller.deleteVoiceAgent('va-1', mockReq);
      expect(result.success).toBe(true);
    });

    it('should throw not found', async () => {
      service.getVoiceAgent.mockResolvedValue(null);
      await expect(controller.deleteVoiceAgent('missing', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw forbidden for wrong user', async () => {
      service.getVoiceAgent.mockResolvedValue({ id: 'va-1', subAccount: { userId: 'other' } });
      await expect(controller.deleteVoiceAgent('va-1', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw 500 on service error', async () => {
      service.deleteVoiceAgent.mockRejectedValue(new Error('fail'));
      await expect(controller.deleteVoiceAgent('va-1', mockReq)).rejects.toThrow(HttpException);
    });
  });

  describe('createVoiceAgent — additional error paths', () => {
    it('should throw when sub-account not found', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue(null);
      await expect(
        controller.createVoiceAgent(
          { subAccountId: 'missing', config: { name: 'T', voiceId: 'n' } },
          mockReq,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw 500 when service throws', async () => {
      prisma.ghlSubAccount.findUnique.mockResolvedValue({ id: 'sa-1', userId: 'u-1' });
      service.createVoiceAgent.mockRejectedValue(new Error('Create fail'));
      await expect(
        controller.createVoiceAgent(
          { subAccountId: 'sa-1', config: { name: 'T', voiceId: 'n' } },
          mockReq,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getVoiceAgent — additional error paths', () => {
    it('should throw forbidden for wrong user', async () => {
      service.getVoiceAgent.mockResolvedValue({ id: 'va-1', subAccount: { userId: 'other' } });
      await expect(controller.getVoiceAgent('va-1', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw 500 on non-HttpException', async () => {
      service.getVoiceAgent.mockRejectedValue(new Error('random error'));
      await expect(controller.getVoiceAgent('va-1', mockReq)).rejects.toThrow(HttpException);
    });

    it('should re-throw HttpException as-is', async () => {
      service.getVoiceAgent.mockRejectedValue(new HttpException('Custom', 418));
      try {
        await controller.getVoiceAgent('va-1', mockReq);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(418);
      }
    });
  });
});
