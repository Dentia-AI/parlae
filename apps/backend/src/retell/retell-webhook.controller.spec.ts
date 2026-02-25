import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import * as crypto from 'crypto';
import { RetellWebhookController } from './retell-webhook.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('RetellWebhookController', () => {
  let controller: RetellWebhookController;
  let prisma: any;

  const mockPrisma = {
    callReference: {
      upsert: jest.fn().mockResolvedValue({ vapiCallId: 'call-1', accountId: 'acc-1' }),
    },
    retellPhoneNumber: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RetellWebhookController],
      providers: [{ provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    controller = module.get<RetellWebhookController>(RetellWebhookController);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.RETELL_API_KEY;
  });

  // ── Signature verification ──────────────────────────────────────────

  describe('verifySignature (static)', () => {
    const API_KEY = 'test-api-key-123';

    function sign(body: string): string {
      return crypto.createHmac('sha256', API_KEY).update(body).digest('hex');
    }

    it('should accept a valid signature', () => {
      const body = '{"event":"call_started"}';
      expect(RetellWebhookController.verifySignature(body, sign(body), API_KEY)).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const body = '{"event":"call_started"}';
      expect(RetellWebhookController.verifySignature(body, 'bad-sig', API_KEY)).toBe(false);
    });

    it('should reject when signature is missing', () => {
      expect(RetellWebhookController.verifySignature('{}', '', API_KEY)).toBe(false);
    });

    it('should reject when apiKey is missing', () => {
      expect(RetellWebhookController.verifySignature('{}', 'sig', '')).toBe(false);
    });
  });

  describe('handleWebhook — signature enforcement', () => {
    const API_KEY = 'test-api-key-456';
    const body = { event: 'call_ended', call: { call_id: 'c-1' } };

    function signBody(payload: any): string {
      const raw = JSON.stringify(payload);
      return crypto.createHmac('sha256', API_KEY).update(raw).digest('hex');
    }

    function makeReq(rawBody?: Buffer) {
      return { rawBody } as any;
    }

    it('should reject request with invalid signature when API key is set', async () => {
      process.env.RETELL_API_KEY = API_KEY;
      await expect(
        controller.handleWebhook(makeReq(Buffer.from(JSON.stringify(body))), body, 'bad-sig'),
      ).rejects.toThrow(HttpException);
    });

    it('should accept request with valid signature', async () => {
      process.env.RETELL_API_KEY = API_KEY;
      const rawStr = JSON.stringify(body);
      const sig = signBody(body);
      const result = await controller.handleWebhook(makeReq(Buffer.from(rawStr)), body, sig);
      expect(result).toEqual({ received: true });
    });

    it('should skip verification when no API key is configured', async () => {
      delete process.env.RETELL_API_KEY;
      const result = await controller.handleWebhook(makeReq(), body, '');
      expect(result).toEqual({ received: true });
    });
  });

  // ── Call lifecycle events ───────────────────────────────────────────

  describe('call_started', () => {
    function makeReq() {
      return { rawBody: undefined } as any;
    }

    it('should create CallReference with provider RETELL', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValueOnce({ accountId: 'acc-1' });

      const body = {
        event: 'call_started',
        call: { call_id: 'retell-call-1', agent_id: 'agent-1' },
      };
      const result = await controller.handleWebhook(makeReq(), body, '');
      expect(result).toEqual({ received: true });
      expect(prisma.callReference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vapiCallId: 'retell-call-1' },
          create: expect.objectContaining({
            vapiCallId: 'retell-call-1',
            accountId: 'acc-1',
            provider: 'RETELL',
          }),
        }),
      );
    });

    it('should resolve account from metadata', async () => {
      const body = {
        event: 'call_started',
        call: { call_id: 'retell-call-2', metadata: { accountId: 'acc-meta' } },
      };
      await controller.handleWebhook(makeReq(), body, '');
      expect(prisma.callReference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ accountId: 'acc-meta' }),
        }),
      );
    });

    it('should resolve account from phone number when agent lookup fails', async () => {
      prisma.retellPhoneNumber.findFirst
        .mockResolvedValueOnce(null) // agent_id lookup
        .mockResolvedValueOnce({ accountId: 'acc-phone' }); // to_number lookup

      const body = {
        event: 'call_started',
        call: { call_id: 'retell-call-3', agent_id: 'unknown', to_number: '+14165551234' },
      };
      await controller.handleWebhook(makeReq(), body, '');
      expect(prisma.callReference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ accountId: 'acc-phone' }),
        }),
      );
    });

    it('should not create CallReference when account cannot be resolved', async () => {
      const body = {
        event: 'call_started',
        call: { call_id: 'retell-call-4' },
      };
      await controller.handleWebhook(makeReq(), body, '');
      expect(prisma.callReference.upsert).not.toHaveBeenCalled();
    });
  });

  describe('call_ended', () => {
    it('should return received', async () => {
      const body = {
        event: 'call_ended',
        call: { call_id: 'c-1', call_status: 'ended', start_timestamp: 1000, end_timestamp: 2000 },
      };
      const result = await controller.handleWebhook({ rawBody: undefined } as any, body, '');
      expect(result).toEqual({ received: true });
    });
  });

  describe('call_analyzed', () => {
    it('should return received', async () => {
      const body = {
        event: 'call_analyzed',
        call: { call_id: 'c-1', call_analysis: { call_outcome: 'appointment_booked' } },
      };
      const result = await controller.handleWebhook({ rawBody: undefined } as any, body, '');
      expect(result).toEqual({ received: true });
    });
  });

  describe('unhandled event', () => {
    it('should return received for unknown events', async () => {
      const body = { event: 'some_future_event', call: {} };
      const result = await controller.handleWebhook({ rawBody: undefined } as any, body, '');
      expect(result).toEqual({ received: true });
    });
  });
});
