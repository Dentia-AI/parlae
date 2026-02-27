import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import * as crypto from 'crypto';
import { RetellWebhookController } from './retell-webhook.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AgentToolsService } from '../agent-tools/agent-tools.service';

function createMockReq(body: any, rawBody?: Buffer, remoteAddress?: string) {
  return {
    rawBody,
    body,
    headers: {},
    socket: { remoteAddress: remoteAddress || '127.0.0.1' },
  } as any;
}

describe('RetellWebhookController', () => {
  let controller: RetellWebhookController;
  let prisma: any;
  let agentToolsService: any;

  const mockPrisma = {
    callReference: {
      upsert: jest.fn().mockResolvedValue({ callId: 'call-1', accountId: 'acc-1' }),
    },
    retellPhoneNumber: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const mockAgentToolsService = {
    prefetchCallerContext: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RetellWebhookController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AgentToolsService, useValue: mockAgentToolsService },
      ],
    }).compile();

    controller = module.get<RetellWebhookController>(RetellWebhookController);
    prisma = module.get(PrismaService);
    agentToolsService = module.get(AgentToolsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.RETELL_API_KEY;
  });

  // ── Signature verification ──────────────────────────────────────────

  describe('verifySignature (static)', () => {
    const API_KEY = 'test-api-key-123';

    function sign(body: string, timestamp: number = Date.now()): string {
      const digest = crypto.createHmac('sha256', API_KEY).update(body + timestamp).digest('hex');
      return `v=${timestamp},d=${digest}`;
    }

    it('should accept a valid signature', async () => {
      const body = '{"event":"call_started"}';
      expect(await RetellWebhookController.verifySignature(body, sign(body), API_KEY)).toBe(true);
    });

    it('should reject an invalid signature', async () => {
      const body = '{"event":"call_started"}';
      expect(await RetellWebhookController.verifySignature(body, 'v=123,d=bad', API_KEY)).toBe(false);
    });

    it('should reject a malformed signature', async () => {
      expect(await RetellWebhookController.verifySignature('{}', 'bad-sig', API_KEY)).toBe(false);
    });

    it('should reject when signature is missing', async () => {
      expect(await RetellWebhookController.verifySignature('{}', '', API_KEY)).toBe(false);
    });

    it('should reject when apiKey is missing', async () => {
      expect(await RetellWebhookController.verifySignature('{}', 'v=1,d=abc', '')).toBe(false);
    });

    it('should reject an expired timestamp', async () => {
      const body = '{"event":"call_started"}';
      const staleTimestamp = Date.now() - 6 * 60 * 1000;
      expect(await RetellWebhookController.verifySignature(body, sign(body, staleTimestamp), API_KEY)).toBe(false);
    });
  });

  describe('handleWebhook — signature enforcement', () => {
    const API_KEY = 'test-api-key-456';
    const body = { event: 'call_ended', call: { call_id: 'c-1' } };

    function signRaw(raw: string, timestamp: number = Date.now()): string {
      const digest = crypto.createHmac('sha256', API_KEY).update(raw + timestamp).digest('hex');
      return `v=${timestamp},d=${digest}`;
    }

    it('should reject request with invalid signature when API key is set', async () => {
      process.env.RETELL_API_KEY = API_KEY;
      const req = createMockReq(body);
      await expect(
        controller.handleWebhook(body, 'v=123,d=bad', req),
      ).rejects.toThrow(HttpException);
    });

    it('should accept request when rawBody matches signature', async () => {
      process.env.RETELL_API_KEY = API_KEY;
      const rawStr = JSON.stringify(body);
      const rawBody = Buffer.from(rawStr);
      const sig = signRaw(rawStr);
      const req = createMockReq(body, rawBody);
      const result = await controller.handleWebhook(body, sig, req);
      expect(result).toEqual({ received: true });
    });

    it('should use rawBody over JSON.stringify for verification', async () => {
      process.env.RETELL_API_KEY = API_KEY;
      const rawStr = '{"event":"call_ended","call":{"call_id":"c-1"}}';
      const rawBody = Buffer.from(rawStr);
      const sig = signRaw(rawStr);
      const reorderedBody = { call: { call_id: 'c-1' }, event: 'call_ended' };
      const req = createMockReq(reorderedBody, rawBody);
      const result = await controller.handleWebhook(reorderedBody, sig, req);
      expect(result).toEqual({ received: true });
    });

    it('should fall back to JSON.stringify when rawBody is undefined', async () => {
      process.env.RETELL_API_KEY = API_KEY;
      const sig = signRaw(JSON.stringify(body));
      const req = createMockReq(body);
      const result = await controller.handleWebhook(body, sig, req);
      expect(result).toEqual({ received: true });
    });

    it('should skip verification when no API key is configured', async () => {
      delete process.env.RETELL_API_KEY;
      const req = createMockReq(body);
      const result = await controller.handleWebhook(body, '', req);
      expect(result).toEqual({ received: true });
    });

    it('should fall back to JSON.stringify when rawBody HMAC fails', async () => {
      process.env.RETELL_API_KEY = API_KEY;
      const jsonStr = JSON.stringify(body);
      const sig = signRaw(jsonStr);
      // rawBody differs from JSON.stringify (e.g. extra whitespace)
      const rawBody = Buffer.from('{"event": "call_ended", "call": {"call_id":"c-1"}}');
      const req = createMockReq(body, rawBody);
      const result = await controller.handleWebhook(body, sig, req);
      expect(result).toEqual({ received: true });
    });

    it('should accept request from Retell IP when both HMAC methods fail', async () => {
      process.env.RETELL_API_KEY = API_KEY;
      const req = createMockReq(body, undefined, '100.20.5.228');
      const result = await controller.handleWebhook(body, 'v=123,d=bad', req);
      expect(result).toEqual({ received: true });
    });

    it('should reject request from unknown IP when both HMAC methods fail', async () => {
      process.env.RETELL_API_KEY = API_KEY;
      const req = createMockReq(body, undefined, '1.2.3.4');
      await expect(
        controller.handleWebhook(body, 'v=123,d=bad', req),
      ).rejects.toThrow(HttpException);
    });

    it('should accept via x-forwarded-for from Retell IP', async () => {
      process.env.RETELL_API_KEY = API_KEY;
      const req = createMockReq(body);
      req.headers = { 'x-forwarded-for': '100.20.5.228, 10.0.0.1' };
      const result = await controller.handleWebhook(body, 'v=123,d=bad', req);
      expect(result).toEqual({ received: true });
    });
  });

  // ── Call lifecycle events ───────────────────────────────────────────

  describe('call_started', () => {
    it('should create CallReference with provider RETELL', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValueOnce({ accountId: 'acc-1' });

      const body = {
        event: 'call_started',
        call: { call_id: 'retell-call-1', agent_id: 'agent-1' },
      };
      const result = await controller.handleWebhook(body, '', createMockReq(body));
      expect(result).toEqual({ received: true });
      expect(prisma.callReference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { callId: 'retell-call-1' },
          create: expect.objectContaining({
            callId: 'retell-call-1',
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
      await controller.handleWebhook(body, '', createMockReq(body));
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
      await controller.handleWebhook(body, '', createMockReq(body));
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
      await controller.handleWebhook(body, '', createMockReq(body));
      expect(prisma.callReference.upsert).not.toHaveBeenCalled();
    });

    it('should fire prefetchCallerContext when call has from_number', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValueOnce({ accountId: 'acc-1' });

      const body = {
        event: 'call_started',
        call: { call_id: 'retell-call-5', agent_id: 'agent-1', from_number: '+14155551234' },
      };
      await controller.handleWebhook(body, '', createMockReq(body));

      await new Promise((r) => setTimeout(r, 50));

      expect(agentToolsService.prefetchCallerContext).toHaveBeenCalledWith(
        'retell-call-5',
        '+14155551234',
        'acc-1',
        'RETELL',
      );
    });

    it('should not fire prefetchCallerContext when from_number is missing', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValueOnce({ accountId: 'acc-1' });

      const body = {
        event: 'call_started',
        call: { call_id: 'retell-call-6', agent_id: 'agent-1' },
      };
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(agentToolsService.prefetchCallerContext).not.toHaveBeenCalled();
    });

    it('should not fire prefetchCallerContext when account cannot be resolved', async () => {
      const body = {
        event: 'call_started',
        call: { call_id: 'retell-call-7', from_number: '+14155551234' },
      };
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(agentToolsService.prefetchCallerContext).not.toHaveBeenCalled();
    });

    it('should not block webhook response if prefetch fails', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValueOnce({ accountId: 'acc-1' });
      agentToolsService.prefetchCallerContext.mockRejectedValueOnce(new Error('Prefetch boom'));

      const body = {
        event: 'call_started',
        call: { call_id: 'retell-call-8', agent_id: 'agent-1', from_number: '+14155551234' },
      };
      const result = await controller.handleWebhook(body, '', createMockReq(body));

      expect(result).toEqual({ received: true });
    });
  });

  describe('call_ended', () => {
    it('should return received', async () => {
      const body = {
        event: 'call_ended',
        call: { call_id: 'c-1', call_status: 'ended', start_timestamp: 1000, end_timestamp: 2000 },
      };
      const result = await controller.handleWebhook(body, '', createMockReq(body));
      expect(result).toEqual({ received: true });
    });
  });

  describe('call_analyzed', () => {
    it('should return received', async () => {
      const body = {
        event: 'call_analyzed',
        call: { call_id: 'c-1', call_analysis: { call_outcome: 'appointment_booked' } },
      };
      const result = await controller.handleWebhook(body, '', createMockReq(body));
      expect(result).toEqual({ received: true });
    });
  });

  describe('unhandled event', () => {
    it('should return received for unknown events', async () => {
      const body = { event: 'some_future_event', call: {} };
      const result = await controller.handleWebhook(body, '', createMockReq(body));
      expect(result).toEqual({ received: true });
    });
  });
});
