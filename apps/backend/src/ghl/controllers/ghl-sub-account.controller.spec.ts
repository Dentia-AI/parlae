import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlSubAccountController } from './ghl-sub-account.controller';
import { GhlSubAccountService } from '../services/ghl-sub-account.service';
import { DevAuthGuard } from '../../auth/dev-auth.guard';
import { CognitoJwtVerifierService } from '../../auth/cognito-jwt-verifier.service';

describe('GhlSubAccountController', () => {
  let controller: GhlSubAccountController;
  let service: any;

  const mockReq = { user: { id: 'u-1', sub: 'u-1' } };

  beforeEach(async () => {
    const mockService = {
      createSubAccount: jest.fn().mockResolvedValue({ id: 'sa-1', businessName: 'Test' }),
      getSubAccountByUserId: jest.fn().mockResolvedValue({ id: 'sa-1', userId: 'u-1' }),
      getSubAccountById: jest.fn().mockResolvedValue({ id: 'sa-1', userId: 'u-1', ghlLocationId: 'loc-1' }),
      updateSubAccount: jest.fn().mockResolvedValue({ id: 'sa-1', businessName: 'Updated' }),
      updateSetupStep: jest.fn().mockResolvedValue({ id: 'sa-1', setupStep: 3 }),
      suspendSubAccount: jest.fn().mockResolvedValue({ id: 'sa-1', status: 'SUSPENDED' }),
      reactivateSubAccount: jest.fn().mockResolvedValue({ id: 'sa-1', status: 'ACTIVE' }),
      deleteSubAccount: jest.fn().mockResolvedValue({ id: 'sa-1', status: 'DELETED' }),
      syncSubAccountFromGhl: jest.fn().mockResolvedValue({ id: 'sa-1' }),
      listUserSubAccounts: jest.fn().mockResolvedValue([{ id: 'sa-1' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GhlSubAccountController],
      providers: [
        { provide: GhlSubAccountService, useValue: mockService },
        DevAuthGuard,
        { provide: CognitoJwtVerifierService, useValue: { verifyToken: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<GhlSubAccountController>(GhlSubAccountController);
    service = module.get(GhlSubAccountService);
  });

  it('should be defined', () => { expect(controller).toBeDefined(); });

  describe('createSubAccount', () => {
    it('should create sub-account', async () => {
      const result = await controller.createSubAccount(
        { businessName: 'Test' } as any,
        mockReq,
      );
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe('sa-1');
    });

    it('should throw when creation fails', async () => {
      service.createSubAccount.mockResolvedValue(null);
      await expect(
        controller.createSubAccount({ businessName: 'Test' } as any, mockReq),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getMySubAccount', () => {
    it('should return user sub-account', async () => {
      const result = await controller.getMySubAccount(mockReq);
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe('sa-1');
    });

    it('should return null when none found', async () => {
      service.getSubAccountByUserId.mockResolvedValue(null);
      const result = await controller.getMySubAccount(mockReq);
      expect(result.data).toBeNull();
    });
  });

  describe('getSubAccount', () => {
    it('should return sub-account by id', async () => {
      const result = await controller.getSubAccount('sa-1', mockReq);
      expect(result.success).toBe(true);
    });

    it('should throw not found', async () => {
      service.getSubAccountById.mockResolvedValue(null);
      await expect(controller.getSubAccount('missing', mockReq)).rejects.toThrow(HttpException);
    });

    it('should throw forbidden for wrong user', async () => {
      service.getSubAccountById.mockResolvedValue({ id: 'sa-1', userId: 'other' });
      await expect(controller.getSubAccount('sa-1', mockReq)).rejects.toThrow(HttpException);
    });
  });

  describe('updateSubAccount', () => {
    it('should update sub-account', async () => {
      const result = await controller.updateSubAccount('sa-1', { businessName: 'Updated' } as any, mockReq);
      expect(result.success).toBe(true);
    });
  });

  describe('updateSetupStep', () => {
    it('should update setup step', async () => {
      const result = await controller.updateSetupStep('sa-1', { setupStep: 3 }, mockReq);
      expect(result.success).toBe(true);
    });
  });

  describe('suspendSubAccount', () => {
    it('should suspend', async () => {
      const result = await controller.suspendSubAccount('sa-1', mockReq);
      expect(result.success).toBe(true);
    });
  });

  describe('reactivateSubAccount', () => {
    it('should reactivate', async () => {
      const result = await controller.reactivateSubAccount('sa-1', mockReq);
      expect(result.success).toBe(true);
    });
  });

  describe('deleteSubAccount', () => {
    it('should delete', async () => {
      const result = await controller.deleteSubAccount('sa-1', mockReq);
      expect(result.success).toBe(true);
    });
  });

  describe('syncSubAccount', () => {
    it('should sync from GHL', async () => {
      const result = await controller.syncSubAccount('sa-1', mockReq);
      expect(result.success).toBe(true);
    });

    it('should throw when sync fails', async () => {
      service.syncSubAccountFromGhl.mockResolvedValue(null);
      await expect(controller.syncSubAccount('sa-1', mockReq)).rejects.toThrow(HttpException);
    });
  });

  describe('listSubAccounts', () => {
    it('should list sub-accounts', async () => {
      const result = await controller.listSubAccounts(mockReq);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });
  });
});
