import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PmsController } from './pms.controller';
import { PmsService } from './pms.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { CognitoJwtVerifierService } from '../auth/cognito-jwt-verifier.service';

describe('PmsController', () => {
  let controller: PmsController;
  let service: any;

  const mockReq = { user: { sub: 'u-1' } };

  beforeEach(async () => {
    const mockService = {
      setupPmsIntegration: jest.fn().mockResolvedValue({ success: true, provider: 'SIKKA' }),
      getPmsStatus: jest.fn().mockResolvedValue({ success: true, integrations: [] }),
      getConnectionStatus: jest.fn().mockResolvedValue({ isConnected: false, status: 'pending' }),
      handleSikkaOAuthCallback: jest.fn().mockResolvedValue({ success: true, practiceName: 'Test' }),
      handlePurchaseWebhook: jest.fn().mockResolvedValue({ success: true, accountId: 'acc-1' }),
      handleCancelWebhook: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PmsController],
      providers: [
        { provide: PmsService, useValue: mockService },
        CognitoAuthGuard,
        { provide: CognitoJwtVerifierService, useValue: { verifyToken: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<PmsController>(PmsController);
    service = module.get(PmsService);
  });

  afterEach(() => {
    delete process.env.SIKKA_WEBHOOK_CALLBACK_KEY;
  });

  it('should be defined', () => { expect(controller).toBeDefined(); });

  describe('setupPms', () => {
    it('should call setupPmsIntegration with userId from JWT', async () => {
      const result = await controller.setupPms({ provider: 'SIKKA' } as any, mockReq);
      expect(result.success).toBe(true);
      expect(service.setupPmsIntegration).toHaveBeenCalledWith('u-1', { provider: 'SIKKA' });
    });
  });

  describe('getStatus', () => {
    it('should return PMS status for user', async () => {
      const result = await controller.getStatus(mockReq);
      expect(result.success).toBe(true);
      expect(service.getPmsStatus).toHaveBeenCalledWith('u-1');
    });
  });

  describe('checkConnectionStatus', () => {
    it('should return connection status', async () => {
      const result = await controller.checkConnectionStatus('acc-1', mockReq);
      expect(result.status).toBe('pending');
      expect(service.getConnectionStatus).toHaveBeenCalledWith('acc-1');
    });

    it('should throw when accountId missing', async () => {
      await expect(
        controller.checkConnectionStatus(undefined as any, mockReq),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('handleSikkaOAuthCallback', () => {
    it('should redirect on success', async () => {
      const result = await controller.handleSikkaOAuthCallback('code-1', btoa(JSON.stringify({
        accountId: 'acc-1',
        timestamp: Date.now(),
        nonce: 'nonce-1',
      })));
      expect(result.redirect).toContain('status=success');
    });

    it('should return error redirect when OAuth error', async () => {
      const result = await controller.handleSikkaOAuthCallback(
        undefined as any,
        undefined as any,
        'access_denied',
        'User denied',
      );
      expect(result.redirect).toContain('status=error');
    });

    it('should throw when code or state missing', async () => {
      await expect(
        controller.handleSikkaOAuthCallback(undefined as any, undefined as any),
      ).rejects.toThrow(HttpException);
    });

    it('should throw on expired state', async () => {
      const expiredState = btoa(JSON.stringify({
        accountId: 'acc-1',
        timestamp: Date.now() - 11 * 60 * 1000,
        nonce: 'nonce-1',
      }));
      await expect(
        controller.handleSikkaOAuthCallback('code-1', expiredState),
      ).rejects.toThrow(HttpException);
    });

    it('should throw on invalid state', async () => {
      await expect(
        controller.handleSikkaOAuthCallback('code-1', 'not-base64-json!!!'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('exchangeSikkaCode', () => {
    it('should exchange code for credentials', async () => {
      const result = await controller.exchangeSikkaCode({
        code: 'code-1',
        accountId: 'acc-1',
      });
      expect(result.success).toBe(true);
      expect(service.handleSikkaOAuthCallback).toHaveBeenCalledWith('code-1', 'acc-1');
    });

    it('should throw when code missing', async () => {
      await expect(
        controller.exchangeSikkaCode({ code: '', accountId: 'acc-1' }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw when accountId missing', async () => {
      await expect(
        controller.exchangeSikkaCode({ code: 'code-1', accountId: '' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('auth guards', () => {
    it('should have CognitoAuthGuard on exchangeSikkaCode', () => {
      const guards = Reflect.getMetadata('__guards__', PmsController.prototype.exchangeSikkaCode);
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
      const guardNames = guards.map((g: any) => g.name || g.constructor?.name);
      expect(guardNames).toContain('CognitoAuthGuard');
    });

    it('should have CognitoAuthGuard on setupPms', () => {
      const guards = Reflect.getMetadata('__guards__', PmsController.prototype.setupPms);
      expect(guards).toBeDefined();
      const guardNames = guards.map((g: any) => g.name || g.constructor?.name);
      expect(guardNames).toContain('CognitoAuthGuard');
    });

    it('should NOT have CognitoAuthGuard on handlePurchaseWebhook', () => {
      const guards = Reflect.getMetadata('__guards__', PmsController.prototype.handlePurchaseWebhook);
      expect(guards ?? []).toHaveLength(0);
    });

    it('should NOT have CognitoAuthGuard on handleCancelWebhook', () => {
      const guards = Reflect.getMetadata('__guards__', PmsController.prototype.handleCancelWebhook);
      expect(guards ?? []).toHaveLength(0);
    });
  });

  describe('handlePurchaseWebhook', () => {
    const purchasePayload = {
      'Email Address': 'clinic@example.com',
      'Master Customer ID': 'mc-123',
      'Practice Name': 'Happy Dental',
      'First Name': 'Jane',
      'Last Name': 'Doe',
      'Status': 'Active',
    };

    it('should accept webhook and call service', async () => {
      const result = await controller.handlePurchaseWebhook(purchasePayload as any);
      expect(result.received).toBe(true);
      expect(result.success).toBe(true);
      expect(service.handlePurchaseWebhook).toHaveBeenCalledWith(purchasePayload);
    });

    it('should reject when callback-key does not match', async () => {
      process.env.SIKKA_WEBHOOK_CALLBACK_KEY = 'correct-key';
      await expect(
        controller.handlePurchaseWebhook(purchasePayload as any, 'wrong-key'),
      ).rejects.toThrow(HttpException);
    });

    it('should accept when callback-key matches', async () => {
      process.env.SIKKA_WEBHOOK_CALLBACK_KEY = 'correct-key';
      const result = await controller.handlePurchaseWebhook(purchasePayload as any, 'correct-key');
      expect(result.received).toBe(true);
    });

    it('should allow when SIKKA_WEBHOOK_CALLBACK_KEY is not set', async () => {
      delete process.env.SIKKA_WEBHOOK_CALLBACK_KEY;
      const result = await controller.handlePurchaseWebhook(purchasePayload as any, undefined);
      expect(result.received).toBe(true);
    });

    it('should still return 200 when service reports failure', async () => {
      service.handlePurchaseWebhook.mockResolvedValue({ success: false, error: 'No account' });
      const result = await controller.handlePurchaseWebhook(purchasePayload as any);
      expect(result.received).toBe(true);
      expect(result.success).toBe(false);
    });
  });

  describe('handleCancelWebhook', () => {
    const cancelPayload = {
      'Master Customer ID': 'mc-123',
      'Email Address': 'clinic@example.com',
      'Cancel Date': '2026-03-08',
    };

    it('should accept webhook and call service', async () => {
      const result = await controller.handleCancelWebhook(cancelPayload as any);
      expect(result.received).toBe(true);
      expect(result.success).toBe(true);
      expect(service.handleCancelWebhook).toHaveBeenCalledWith(cancelPayload);
    });

    it('should reject when callback-key does not match', async () => {
      process.env.SIKKA_WEBHOOK_CALLBACK_KEY = 'correct-key';
      await expect(
        controller.handleCancelWebhook(cancelPayload as any, 'wrong-key'),
      ).rejects.toThrow(HttpException);
    });

    it('should accept when callback-key matches', async () => {
      process.env.SIKKA_WEBHOOK_CALLBACK_KEY = 'correct-key';
      const result = await controller.handleCancelWebhook(cancelPayload as any, 'correct-key');
      expect(result.received).toBe(true);
    });
  });
});
