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

    it('should compute duration from timestamps', async () => {
      prisma.campaignContact = { findUnique: jest.fn(), update: jest.fn(), count: jest.fn() };
      prisma.outboundCampaign = { findUnique: jest.fn(), update: jest.fn() };

      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 0, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});
      prisma.outboundCampaign.update.mockResolvedValue({});
      prisma.campaignContact.count.mockResolvedValue(0);

      const body = {
        event: 'call_ended',
        call: {
          call_id: 'c-dur',
          call_status: 'ended',
          disconnection_reason: 'agent_hangup',
          start_timestamp: 1000000,
          end_timestamp: 1030000,
          metadata: { contactId: 'ct-1', campaignId: 'camp-1' },
        },
      };
      const result = await controller.handleWebhook(body, '', createMockReq(body));
      expect(result).toEqual({ received: true });
      expect(prisma.campaignContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            callDurationSec: 30,
            outcome: 'answered',
          }),
        }),
      );
    });
  });

  describe('processOutboundCallEnded', () => {
    beforeEach(() => {
      prisma.campaignContact = { findUnique: jest.fn(), update: jest.fn(), count: jest.fn() };
      prisma.outboundCampaign = { findUnique: jest.fn(), update: jest.fn() };
    });

    const callEndedBody = (overrides: Record<string, any> = {}) => ({
      event: 'call_ended',
      call: {
        call_id: 'c-out',
        call_status: 'ended',
        disconnection_reason: 'agent_hangup',
        start_timestamp: 1000,
        end_timestamp: 2000,
        metadata: { contactId: 'ct-1', campaignId: 'camp-1' },
        ...overrides,
      },
    });

    it('skips when no contactId in metadata', async () => {
      const body = { event: 'call_ended', call: { call_id: 'c-1', metadata: {} } };
      const result = await controller.handleWebhook(body, '', createMockReq(body));
      expect(result).toEqual({ received: true });
      expect(prisma.campaignContact.findUnique).not.toHaveBeenCalled();
    });

    it('marks contact COMPLETED on agent_hangup', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 1, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});
      prisma.outboundCampaign.update.mockResolvedValue({});
      prisma.campaignContact.count.mockResolvedValue(5);

      const body = callEndedBody({ disconnection_reason: 'agent_hangup' });
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED', outcome: 'answered' }),
        }),
      );
    });

    it('marks contact COMPLETED on user_hangup', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 1, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});
      prisma.outboundCampaign.update.mockResolvedValue({});
      prisma.campaignContact.count.mockResolvedValue(5);

      const body = callEndedBody({ disconnection_reason: 'user_hangup' });
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED', outcome: 'answered' }),
        }),
      );
    });

    it('marks contact VOICEMAIL on voicemail_reached', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 1, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});
      prisma.outboundCampaign.update.mockResolvedValue({});
      prisma.campaignContact.count.mockResolvedValue(5);

      const body = callEndedBody({ disconnection_reason: 'voicemail_reached' });
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'VOICEMAIL', outcome: 'voicemail_left' }),
        }),
      );
    });

    it('marks contact VOICEMAIL on machine_detected', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 1, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});
      prisma.outboundCampaign.update.mockResolvedValue({});
      prisma.campaignContact.count.mockResolvedValue(5);

      const body = callEndedBody({ disconnection_reason: 'machine_detected' });
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'VOICEMAIL', outcome: 'machine_detected' }),
        }),
      );
    });

    it('re-queues contact on no_answer when attempts < max', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 1, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});

      const body = callEndedBody({ disconnection_reason: 'no_answer' });
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'QUEUED' }),
        }),
      );
      expect(prisma.outboundCampaign.update).not.toHaveBeenCalled();
    });

    it('marks contact NO_ANSWER when attempts >= max', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 3, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});
      prisma.outboundCampaign.update.mockResolvedValue({});
      prisma.campaignContact.count.mockResolvedValue(0);

      const body = callEndedBody({ disconnection_reason: 'no_answer' });
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'NO_ANSWER' }),
        }),
      );
    });

    it('handles busy disconnection reason', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 1, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});

      const body = callEndedBody({ disconnection_reason: 'busy' });
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'QUEUED' }),
        }),
      );
    });

    it('marks FAILED on error call_status with unknown disconnection', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 3, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});
      prisma.outboundCampaign.update.mockResolvedValue({});
      prisma.campaignContact.count.mockResolvedValue(0);

      const body = callEndedBody({ disconnection_reason: 'unknown_reason', call_status: 'error' });
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('marks campaign COMPLETED when no contacts remain', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 1, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});
      prisma.outboundCampaign.update.mockResolvedValue({});
      prisma.campaignContact.count.mockResolvedValue(0);

      const body = callEndedBody({ disconnection_reason: 'agent_hangup', start_timestamp: 1000, end_timestamp: 20000 });
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.outboundCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'camp-1' }, data: { status: 'COMPLETED' } }),
      );
    });

    it('increments successfulCount for long completed calls', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 1, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});
      prisma.outboundCampaign.update.mockResolvedValue({});
      prisma.campaignContact.count.mockResolvedValue(3);

      const body = callEndedBody({
        disconnection_reason: 'agent_hangup',
        start_timestamp: 1000,
        end_timestamp: 16000,
      });
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.outboundCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completedCount: { increment: 1 },
            successfulCount: { increment: 1 },
          }),
        }),
      );
    });

    it('skips when contact not found in DB', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue(null);

      const body = callEndedBody();
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).not.toHaveBeenCalled();
    });

    it('skips when campaign not found in DB', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 1 });
      prisma.outboundCampaign.findUnique.mockResolvedValue(null);

      const body = callEndedBody();
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).not.toHaveBeenCalled();
    });

    it('handles DB error in processOutboundCallEnded gracefully', async () => {
      prisma.campaignContact.findUnique.mockRejectedValue(new Error('DB connection lost'));

      const body = callEndedBody();
      const result = await controller.handleWebhook(body, '', createMockReq(body));
      expect(result).toEqual({ received: true });
    });

    it('logs DNC candidate on very short user_hangup', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ id: 'ct-1', attempts: 1, phoneNumber: '+15551001' });
      prisma.outboundCampaign.findUnique.mockResolvedValue({ id: 'camp-1', maxAttemptsPerContact: 3 });
      prisma.campaignContact.update.mockResolvedValue({});
      prisma.outboundCampaign.update.mockResolvedValue({});
      prisma.campaignContact.count.mockResolvedValue(5);

      const body = callEndedBody({
        disconnection_reason: 'user_hangup',
        start_timestamp: 1000,
        end_timestamp: 3000,
      });
      const result = await controller.handleWebhook(body, '', createMockReq(body));
      expect(result).toEqual({ received: true });
    });
  });

  describe('processOutboundCallAnalyzed', () => {
    beforeEach(() => {
      prisma.campaignContact = { findUnique: jest.fn(), update: jest.fn() };
      prisma.doNotCallEntry = { upsert: jest.fn() };
    });

    it('skips when no contactId in metadata', async () => {
      const body = { event: 'call_analyzed', call: { call_id: 'c-1', metadata: {} } };
      const result = await controller.handleWebhook(body, '', createMockReq(body));
      expect(result).toEqual({ received: true });
    });

    it('updates contact with call_summary and user_sentiment', async () => {
      prisma.campaignContact.update.mockResolvedValue({});

      const body = {
        event: 'call_analyzed',
        call: {
          call_id: 'c-a1',
          metadata: { contactId: 'ct-1', campaignId: 'camp-1' },
          call_analysis: {
            call_summary: 'Patient wants to reschedule',
            user_sentiment: 'positive',
          },
        },
      };
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ct-1' },
          data: expect.objectContaining({
            summary: 'Patient wants to reschedule',
            sentiment: 'positive',
          }),
        }),
      );
    });

    it('updates outcome from custom_analysis_data', async () => {
      prisma.campaignContact.update.mockResolvedValue({});

      const body = {
        event: 'call_analyzed',
        call: {
          call_id: 'c-a2',
          metadata: { contactId: 'ct-2', campaignId: 'camp-1' },
          call_analysis: {
            custom_analysis_data: { outcome: 'appointment_booked' },
          },
        },
      };
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.campaignContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'appointment_booked',
            analysisData: { outcome: 'appointment_booked' },
          }),
        }),
      );
    });

    it('auto-adds to DNC list when do_not_call is true', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ phoneNumber: '+15551001' });
      prisma.doNotCallEntry.upsert.mockResolvedValue({});
      prisma.campaignContact.update.mockResolvedValue({});

      const body = {
        event: 'call_analyzed',
        call: {
          call_id: 'c-a3',
          metadata: { contactId: 'ct-3', campaignId: 'camp-1', accountId: 'acc-1' },
          call_analysis: {
            custom_analysis_data: { do_not_call: true },
          },
        },
      };
      await controller.handleWebhook(body, '', createMockReq(body));

      expect(prisma.doNotCallEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId_phoneNumber: { accountId: 'acc-1', phoneNumber: '+15551001' } },
          create: expect.objectContaining({
            accountId: 'acc-1',
            phoneNumber: '+15551001',
            reason: 'auto_detected',
            source: 'call_analysis',
          }),
        }),
      );
    });

    it('auto-adds to DNC list when do_not_call is string "true"', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ phoneNumber: '+15552002' });
      prisma.doNotCallEntry.upsert.mockResolvedValue({});
      prisma.campaignContact.update.mockResolvedValue({});

      const body = {
        event: 'call_analyzed',
        call: {
          call_id: 'c-a4',
          metadata: { contactId: 'ct-4', campaignId: 'camp-1', accountId: 'acc-1' },
          call_analysis: {
            custom_analysis_data: { do_not_call: 'true' },
          },
        },
      };
      await controller.handleWebhook(body, '', createMockReq(body));
      expect(prisma.doNotCallEntry.upsert).toHaveBeenCalled();
    });

    it('does not add to DNC when do_not_call is false', async () => {
      prisma.campaignContact.update.mockResolvedValue({});

      const body = {
        event: 'call_analyzed',
        call: {
          call_id: 'c-a5',
          metadata: { contactId: 'ct-5', campaignId: 'camp-1', accountId: 'acc-1' },
          call_analysis: {
            custom_analysis_data: { do_not_call: false, outcome: 'scheduled' },
          },
        },
      };
      await controller.handleWebhook(body, '', createMockReq(body));
      expect(prisma.doNotCallEntry?.upsert).not.toHaveBeenCalled();
    });

    it('does not DNC when accountId is missing', async () => {
      prisma.campaignContact.findUnique.mockResolvedValue({ phoneNumber: '+15551001' });
      prisma.campaignContact.update.mockResolvedValue({});

      const body = {
        event: 'call_analyzed',
        call: {
          call_id: 'c-a6',
          metadata: { contactId: 'ct-6' },
          call_analysis: {
            custom_analysis_data: { do_not_call: true },
          },
        },
      };
      await controller.handleWebhook(body, '', createMockReq(body));
      expect(prisma.doNotCallEntry?.upsert).not.toHaveBeenCalled();
    });

    it('does not update when no analysis fields present', async () => {
      const body = {
        event: 'call_analyzed',
        call: {
          call_id: 'c-a7',
          metadata: { contactId: 'ct-7' },
          call_analysis: {},
        },
      };
      await controller.handleWebhook(body, '', createMockReq(body));
      expect(prisma.campaignContact.update).not.toHaveBeenCalled();
    });

    it('handles DB error gracefully', async () => {
      prisma.campaignContact.update.mockRejectedValue(new Error('DB error'));

      const body = {
        event: 'call_analyzed',
        call: {
          call_id: 'c-a8',
          metadata: { contactId: 'ct-8' },
          call_analysis: { call_summary: 'test' },
        },
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

  describe('transcript_updated', () => {
    it('should return received for transcript events', async () => {
      const body = { event: 'transcript_updated', call: { call_id: 'c-1' } };
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

  describe('call_started — edge cases', () => {
    it('handles callReference upsert failure gracefully', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValueOnce({ accountId: 'acc-1' });
      prisma.callReference.upsert.mockRejectedValue(new Error('upsert failed'));

      const body = {
        event: 'call_started',
        call: { call_id: 'retell-fail', agent_id: 'agent-1' },
      };
      const result = await controller.handleWebhook(body, '', createMockReq(body));
      expect(result).toEqual({ received: true });
    });

    it('returns received when call has no call_id', async () => {
      const body = { event: 'call_started', call: {} };
      const result = await controller.handleWebhook(body, '', createMockReq(body));
      expect(result).toEqual({ received: true });
      expect(prisma.callReference.upsert).not.toHaveBeenCalled();
    });

    it('resolves account via agent_id lookup error then falls through to phone', async () => {
      prisma.retellPhoneNumber.findFirst
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ accountId: 'acc-phone' });

      const body = {
        event: 'call_started',
        call: { call_id: 'c-fallback', agent_id: 'a-1', to_number: '+14165550000' },
      };
      await controller.handleWebhook(body, '', createMockReq(body));
      expect(prisma.callReference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ accountId: 'acc-phone' }),
        }),
      );
    });

    it('resolves account returns null when phone lookup also fails', async () => {
      prisma.retellPhoneNumber.findFirst
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('DB error'));

      const body = {
        event: 'call_started',
        call: { call_id: 'c-both-fail', agent_id: 'a-1', to_number: '+14165550000' },
      };
      await controller.handleWebhook(body, '', createMockReq(body));
      expect(prisma.callReference.upsert).not.toHaveBeenCalled();
    });
  });

  describe('extractClientIp', () => {
    it('handles x-forwarded-for as array', async () => {
      process.env.RETELL_API_KEY = 'test-key';
      const req = createMockReq({ event: 'call_ended', call: { call_id: 'c-1' } });
      req.headers = { 'x-forwarded-for': ['100.20.5.228', '10.0.0.1'] };
      const result = await controller.handleWebhook(
        { event: 'call_ended', call: { call_id: 'c-1' } },
        'v=123,d=bad',
        req,
      );
      expect(result).toEqual({ received: true });
    });

    it('uses socket.remoteAddress when no forwarded header', async () => {
      process.env.RETELL_API_KEY = 'test-key';
      const req = createMockReq(
        { event: 'call_ended', call: { call_id: 'c-1' } },
        undefined,
        '100.20.5.228',
      );
      const result = await controller.handleWebhook(
        { event: 'call_ended', call: { call_id: 'c-1' } },
        'v=123,d=bad',
        req,
      );
      expect(result).toEqual({ received: true });
    });
  });

  describe('verifySignature — digest length mismatch', () => {
    it('rejects when digest length differs from expected', async () => {
      const sig = `v=${Date.now()},d=abc`;
      const result = await RetellWebhookController.verifySignature('{}', sig, 'test-key');
      expect(result).toBe(false);
    });
  });
});
