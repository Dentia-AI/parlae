import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VoiceRoutingController } from './voice-routing.controller';
import { PrismaService } from '../prisma/prisma.service';
import { DevAuthGuard } from '../auth/dev-auth.guard';
import { CognitoJwtVerifierService } from '../auth/cognito-jwt-verifier.service';

describe('VoiceRoutingController', () => {
  let controller: VoiceRoutingController;
  let prisma: any;

  const mockPrisma = {
    vapiPhoneNumber: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    retellPhoneNumber: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    voiceProviderToggle: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    account: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceRoutingController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        DevAuthGuard,
        { provide: CognitoJwtVerifierService, useValue: { verifyToken: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<VoiceRoutingController>(VoiceRoutingController);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── routeCall ───────────────────────────────────────────────────────

  describe('routeCall', () => {
    function mockRes() {
      const res: any = {
        set: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
      return res;
    }

    it('should route to Retell number when provider is RETELL', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValueOnce({
        accountId: 'acc-1',
        phoneNumber: '+14165551111',
        account: { voiceProviderOverride: null },
      });
      prisma.voiceProviderToggle.findFirst.mockResolvedValueOnce({
        activeProvider: 'RETELL',
      });

      const res = mockRes();
      await controller.routeCall(
        { To: '+14165551111', From: '+14165559999', CallSid: 'CS1' },
        res,
      );

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/xml');
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      const twiml: string = res.send.mock.calls[0][0];
      expect(twiml).toContain('+14165551111');
      expect(twiml).toContain('<Response>');
    });

    it('should route to Vapi number when provider is VAPI', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValueOnce({
        accountId: 'acc-1',
        phoneNumber: '+14165552222',
        account: { voiceProviderOverride: null },
      });
      prisma.voiceProviderToggle.findFirst.mockResolvedValueOnce({
        activeProvider: 'VAPI',
      });

      const res = mockRes();
      await controller.routeCall(
        { To: '+14165552222', From: '+14165559999', CallSid: 'CS2' },
        res,
      );

      const twiml: string = res.send.mock.calls[0][0];
      expect(twiml).toContain('+14165552222');
    });

    it('should respect per-account voiceProviderOverride', async () => {
      prisma.retellPhoneNumber.findFirst
        .mockResolvedValueOnce({
          accountId: 'acc-1',
          phoneNumber: '+14165553333',
          account: { voiceProviderOverride: 'RETELL' },
        });

      const res = mockRes();
      await controller.routeCall(
        { To: '+14165553333', From: '+14165559999', CallSid: 'CS3' },
        res,
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      const twiml: string = res.send.mock.calls[0][0];
      expect(twiml).toContain('+14165553333');
    });

    it('should fall back to Vapi when no Retell number exists for account', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValueOnce({
        accountId: 'acc-1',
        phoneNumber: '+14165554444',
        account: { voiceProviderOverride: null },
      });
      // retellPhoneNumber returns null for both lookups
      prisma.retellPhoneNumber.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.voiceProviderToggle.findFirst.mockResolvedValueOnce({
        activeProvider: 'RETELL',
      });

      const res = mockRes();
      await controller.routeCall(
        { To: '+14165554444', From: '+14165559999', CallSid: 'CS4' },
        res,
      );

      const twiml: string = res.send.mock.calls[0][0];
      expect(twiml).toContain('+14165554444');
    });

    it('should return TwiML even on error', async () => {
      prisma.vapiPhoneNumber.findFirst.mockRejectedValueOnce(new Error('DB down'));
      prisma.retellPhoneNumber.findFirst.mockRejectedValueOnce(new Error('DB down'));

      const res = mockRes();
      await controller.routeCall(
        { To: '+14165555555', From: '+14165559999', CallSid: 'CS5' },
        res,
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      const twiml: string = res.send.mock.calls[0][0];
      expect(twiml).toContain('<Response>');
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return routing status with counts', async () => {
      prisma.voiceProviderToggle.findFirst.mockResolvedValueOnce({
        activeProvider: 'RETELL',
        switchedAt: new Date('2026-02-01'),
      });
      prisma.vapiPhoneNumber.count.mockResolvedValueOnce(2);
      prisma.retellPhoneNumber.count.mockResolvedValueOnce(3);
      prisma.account.findMany.mockResolvedValueOnce([
        { id: 'acc-x', name: 'X', voiceProviderOverride: 'VAPI' },
      ]);

      const result = await controller.getStatus();
      expect(result.activeProvider).toBe('RETELL');
      expect(result.vapiPhoneNumbers).toBe(2);
      expect(result.retellPhoneNumbers).toBe(3);
      expect(result.retellReady).toBe(true);
      expect(result.accountOverrides).toHaveLength(1);
    });

    it('should default to VAPI when no toggle record exists', async () => {
      prisma.voiceProviderToggle.findFirst.mockResolvedValueOnce(null);
      prisma.vapiPhoneNumber.count.mockResolvedValueOnce(0);
      prisma.retellPhoneNumber.count.mockResolvedValueOnce(0);
      prisma.account.findMany.mockResolvedValueOnce([]);

      const result = await controller.getStatus();
      expect(result.activeProvider).toBe('VAPI');
      expect(result.retellReady).toBe(false);
    });
  });
});
