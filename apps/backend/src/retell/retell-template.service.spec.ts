import { Test, TestingModule } from '@nestjs/testing';
import { RetellTemplateService } from './retell-template.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';

describe('RetellTemplateService', () => {
  let service: RetellTemplateService;
  let prisma: any;
  let fetchSpy: jest.SpyInstance;

  const FAKE_API_KEY = 'retell-test-key-123';

  beforeEach(async () => {
    process.env.RETELL_API_KEY = FAKE_API_KEY;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetellTemplateService,
        { provide: PrismaService, useValue: createMockPrismaService() },
      ],
    }).compile();

    service = module.get<RetellTemplateService>(RetellTemplateService);
    prisma = module.get(PrismaService);

    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.RETELL_API_KEY;
    jest.restoreAllMocks();
  });

  // ── Constructor & isEnabled ──────────────────────────────────────────

  describe('isEnabled', () => {
    it('should return true when RETELL_API_KEY is set', () => {
      expect(service.isEnabled).toBe(true);
    });

    it('should return false when RETELL_API_KEY is empty', async () => {
      delete process.env.RETELL_API_KEY;
      const module = await Test.createTestingModule({
        providers: [
          RetellTemplateService,
          { provide: PrismaService, useValue: createMockPrismaService() },
        ],
      }).compile();
      const svc = module.get<RetellTemplateService>(RetellTemplateService);
      expect(svc.isEnabled).toBe(false);
    });
  });

  // ── getAccountLlmConfigs ─────────────────────────────────────────────

  describe('getAccountLlmConfigs', () => {
    it('should return null when no retellPhoneNumber exists', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);
      const result = await service.getAccountLlmConfigs('acc-1');
      expect(result).toBeNull();
    });

    it('should return null when retellLlmIds is empty object', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({ retellLlmIds: {} });
      const result = await service.getAccountLlmConfigs('acc-1');
      expect(result).toBeNull();
    });

    it('should fetch LLM config for each role', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellLlmIds: { inbound: 'llm-in-1', outbound: 'llm-out-1' },
      });

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ llm_id: 'llm-in-1', model: 'gpt-4' }),
          text: async () => '',
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ llm_id: 'llm-out-1', model: 'gpt-3.5' }),
          text: async () => '',
        } as Response);

      const result = await service.getAccountLlmConfigs('acc-1');

      expect(result).toEqual({
        inbound: { llm_id: 'llm-in-1', model: 'gpt-4' },
        outbound: { llm_id: 'llm-out-1', model: 'gpt-3.5' },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.retellai.com/get-retell-llm/llm-in-1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${FAKE_API_KEY}`,
          }),
        }),
      );
    });

    it('should record error per role when fetch fails', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellLlmIds: { inbound: 'llm-bad' },
      });

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
        json: async () => ({}),
      } as Response);

      const result = await service.getAccountLlmConfigs('acc-1');
      expect(result).toEqual({
        inbound: { error: expect.stringContaining('404') },
      });
    });

    it('should handle mixed success/failure across roles', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellLlmIds: { inbound: 'llm-ok', outbound: 'llm-fail' },
      });

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ llm_id: 'llm-ok' }),
          text: async () => '',
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
          json: async () => ({}),
        } as Response);

      const result = await service.getAccountLlmConfigs('acc-1');
      expect(result!.inbound).toEqual({ llm_id: 'llm-ok' });
      expect(result!.outbound).toEqual({ error: expect.stringContaining('500') });
    });

    it('should pass correct select to prisma query', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);
      await service.getAccountLlmConfigs('acc-42');
      expect(prisma.retellPhoneNumber.findFirst).toHaveBeenCalledWith({
        where: { accountId: 'acc-42' },
        select: { retellLlmIds: true },
      });
    });
  });

  // ── updateLlmForRole ─────────────────────────────────────────────────

  describe('updateLlmForRole', () => {
    it('should return error when no LLM exists for the role', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellLlmIds: { inbound: 'llm-1' },
      });

      const result = await service.updateLlmForRole('acc-1', 'outbound', {
        general_prompt: 'Hello',
      });
      expect(result).toEqual({
        success: false,
        error: 'No LLM found for role: outbound',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should return error when retellPhoneNumber is null', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);
      const result = await service.updateLlmForRole('acc-1', 'inbound', {
        general_prompt: 'Hello',
      });
      expect(result).toEqual({
        success: false,
        error: 'No LLM found for role: inbound',
      });
    });

    it('should PATCH the correct LLM endpoint on success', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellLlmIds: { inbound: 'llm-99' },
      });

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ llm_id: 'llm-99' }),
        text: async () => '',
      } as Response);

      const result = await service.updateLlmForRole('acc-1', 'inbound', {
        general_prompt: 'Updated prompt',
        model: 'gpt-4o',
      });

      expect(result).toEqual({ success: true });
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.retellai.com/update-retell-llm/llm-99',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ general_prompt: 'Updated prompt', model: 'gpt-4o' }),
        }),
      );
    });

    it('should return error when PATCH fails', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellLlmIds: { inbound: 'llm-99' },
      });

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => 'Unprocessable Entity',
        json: async () => ({}),
      } as Response);

      const result = await service.updateLlmForRole('acc-1', 'inbound', {
        general_prompt: 'Bad prompt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('422');
    });
  });

  // ── bulkUpdatePrompts ────────────────────────────────────────────────

  describe('bulkUpdatePrompts', () => {
    it('should update all roles and aggregate results', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellLlmIds: { inbound: 'llm-in', outbound: 'llm-out' },
      });

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
          text: async () => '',
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => 'Bad Request',
          json: async () => ({}),
        } as Response);

      const result = await service.bulkUpdatePrompts('acc-1', {
        inbound: { general_prompt: 'Prompt A' },
        outbound: { general_prompt: 'Prompt B' },
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ role: 'inbound', success: true });
      expect(result.results[1]).toEqual({
        role: 'outbound',
        success: false,
        error: expect.stringContaining('400'),
      });
    });

    it('should return empty results for empty updates', async () => {
      const result = await service.bulkUpdatePrompts('acc-1', {});
      expect(result.results).toEqual([]);
    });

    it('should handle role not found in LLM ids', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellLlmIds: {},
      });

      const result = await service.bulkUpdatePrompts('acc-1', {
        ghost: { general_prompt: 'Hello' },
      });

      expect(result.results).toEqual([
        { role: 'ghost', success: false, error: 'No LLM found for role: ghost' },
      ]);
    });
  });

  // ── getAccountAgentIds ───────────────────────────────────────────────

  describe('getAccountAgentIds', () => {
    it('should return null when no retellPhoneNumber exists', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);
      const result = await service.getAccountAgentIds('acc-1');
      expect(result).toBeNull();
    });

    it('should return null when retellAgentIds is falsy', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({ retellAgentIds: null });
      const result = await service.getAccountAgentIds('acc-1');
      expect(result).toBeNull();
    });

    it('should extract agent_id from string values', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellAgentIds: { inbound: 'agent-str-1', outbound: 'agent-str-2' },
      });

      const result = await service.getAccountAgentIds('acc-1');
      expect(result).toEqual({ inbound: 'agent-str-1', outbound: 'agent-str-2' });
    });

    it('should extract agent_id from object values', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellAgentIds: {
          inbound: { agent_id: 'agent-obj-1', name: 'Inbound' },
          outbound: { agent_id: 'agent-obj-2', name: 'Outbound' },
        },
      });

      const result = await service.getAccountAgentIds('acc-1');
      expect(result).toEqual({ inbound: 'agent-obj-1', outbound: 'agent-obj-2' });
    });

    it('should skip roles with no string or agent_id property', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellAgentIds: {
          inbound: 'agent-1',
          broken: { name: 'no agent_id' },
          numeric: 12345,
        },
      });

      const result = await service.getAccountAgentIds('acc-1');
      expect(result).toEqual({ inbound: 'agent-1' });
    });

    it('should pass correct select to prisma query', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);
      await service.getAccountAgentIds('acc-5');
      expect(prisma.retellPhoneNumber.findFirst).toHaveBeenCalledWith({
        where: { accountId: 'acc-5' },
        select: { retellAgentIds: true },
      });
    });
  });

  // ── listCalls ────────────────────────────────────────────────────────

  describe('listCalls', () => {
    it('should return empty array when not enabled', async () => {
      delete process.env.RETELL_API_KEY;
      const module = await Test.createTestingModule({
        providers: [
          RetellTemplateService,
          { provide: PrismaService, useValue: createMockPrismaService() },
        ],
      }).compile();
      const svc = module.get<RetellTemplateService>(RetellTemplateService);

      const result = await svc.listCalls(['agent-1']);
      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should return empty array when agentIds is empty', async () => {
      const result = await service.listCalls([]);
      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should POST to /v2/list-calls with filter_criteria', async () => {
      const mockCalls = [{ call_id: 'c-1' }, { call_id: 'c-2' }];
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCalls,
        text: async () => '',
      } as Response);

      const result = await service.listCalls(['agent-1', 'agent-2'], 20);

      expect(result).toEqual(mockCalls);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.retellai.com/v2/list-calls',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            filter_criteria: { agent_id: ['agent-1', 'agent-2'] },
            sort_order: 'descending',
            limit: 20,
          }),
        }),
      );
    });

    it('should use default limit of 10', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
        text: async () => '',
      } as Response);

      await service.listCalls(['agent-1']);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"limit":10'),
        }),
      );
    });

    it('should return empty array when API returns non-array', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'unexpected' }),
        text: async () => '',
      } as Response);

      const result = await service.listCalls(['agent-1']);
      expect(result).toEqual([]);
    });

    it('should return empty array on fetch failure', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
        json: async () => ({}),
      } as Response);

      const result = await service.listCalls(['agent-1']);
      expect(result).toEqual([]);
    });
  });

  // ── getCall ──────────────────────────────────────────────────────────

  describe('getCall', () => {
    it('should return null when not enabled', async () => {
      delete process.env.RETELL_API_KEY;
      const module = await Test.createTestingModule({
        providers: [
          RetellTemplateService,
          { provide: PrismaService, useValue: createMockPrismaService() },
        ],
      }).compile();
      const svc = module.get<RetellTemplateService>(RetellTemplateService);

      const result = await svc.getCall('call-1');
      expect(result).toBeNull();
    });

    it('should return null when callId is empty', async () => {
      const result = await service.getCall('');
      expect(result).toBeNull();
    });

    it('should GET /v2/get-call/:callId', async () => {
      const mockCall = { call_id: 'c-1', call_analysis: { outcome: 'success' } };
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCall,
        text: async () => '',
      } as Response);

      const result = await service.getCall('c-1');

      expect(result).toEqual(mockCall);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.retellai.com/v2/get-call/c-1',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should return null on fetch failure', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
        json: async () => ({}),
      } as Response);

      const result = await service.getCall('c-missing');
      expect(result).toBeNull();
    });
  });

  // ── createOutboundCall ───────────────────────────────────────────────

  describe('createOutboundCall', () => {
    it('should return null when not enabled', async () => {
      delete process.env.RETELL_API_KEY;
      const module = await Test.createTestingModule({
        providers: [
          RetellTemplateService,
          { provide: PrismaService, useValue: createMockPrismaService() },
        ],
      }).compile();
      const svc = module.get<RetellTemplateService>(RetellTemplateService);

      const result = await svc.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
      });
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should POST minimal body with from_number and to_number', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'new-call' }),
        text: async () => '',
      } as Response);

      const result = await service.createOutboundCall({
        fromNumber: '+14155550001',
        toNumber: '+14155550002',
      });

      expect(result).toEqual({ call_id: 'new-call' });
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.retellai.com/v2/create-phone-call');
      expect(opts.method).toBe('POST');

      const sentBody = JSON.parse(opts.body);
      expect(sentBody).toEqual({
        from_number: '+14155550001',
        to_number: '+14155550002',
      });
    });

    it('should include override_agent_id when provided', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'new-call' }),
        text: async () => '',
      } as Response);

      await service.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
        overrideAgentId: 'agent-override-1',
      });

      const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sentBody.override_agent_id).toBe('agent-override-1');
    });

    it('should include dynamic variables when provided', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'new-call' }),
        text: async () => '',
      } as Response);

      await service.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
        dynamicVariables: { patientName: 'John Doe' },
      });

      const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sentBody.retell_llm_dynamic_variables).toEqual({ patientName: 'John Doe' });
    });

    it('should skip dynamic variables when empty object', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'new-call' }),
        text: async () => '',
      } as Response);

      await service.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
        dynamicVariables: {},
      });

      const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sentBody.retell_llm_dynamic_variables).toBeUndefined();
    });

    it('should include metadata when provided', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'new-call' }),
        text: async () => '',
      } as Response);

      await service.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
        metadata: { campaignId: 'camp-1' },
      });

      const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sentBody.metadata).toEqual({ campaignId: 'camp-1' });
    });

    it('should skip metadata when empty object', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'new-call' }),
        text: async () => '',
      } as Response);

      await service.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
        metadata: {},
      });

      const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sentBody.metadata).toBeUndefined();
    });

    it('should include voicemail override when provided', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'new-call' }),
        text: async () => '',
      } as Response);

      await service.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
        voicemailMessage: 'Please call us back',
      });

      const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sentBody.agent_override).toEqual({
        agent: {
          enable_voicemail_detection: true,
          voicemail_message: 'Please call us back',
        },
      });
    });

    it('should include max_call_duration_ms in agent_override when provided', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'new-call' }),
        text: async () => '',
      } as Response);

      await service.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
        maxCallDurationMs: 120000,
      });

      const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sentBody.agent_override).toEqual({
        agent: { max_call_duration_ms: 120000 },
      });
    });

    it('should combine voicemail and maxCallDuration in agent_override', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'new-call' }),
        text: async () => '',
      } as Response);

      await service.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
        voicemailMessage: 'Leave a message',
        maxCallDurationMs: 60000,
      });

      const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sentBody.agent_override).toEqual({
        agent: {
          enable_voicemail_detection: true,
          voicemail_message: 'Leave a message',
          max_call_duration_ms: 60000,
        },
      });
    });

    it('should not include agent_override when no overrides provided', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'new-call' }),
        text: async () => '',
      } as Response);

      await service.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
      });

      const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sentBody.agent_override).toBeUndefined();
    });

    it('should include all options together', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'full-call' }),
        text: async () => '',
      } as Response);

      await service.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
        overrideAgentId: 'agent-x',
        dynamicVariables: { name: 'Jane' },
        metadata: { source: 'campaign' },
        voicemailMessage: 'VM',
        maxCallDurationMs: 90000,
      });

      const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(sentBody).toEqual({
        from_number: '+1111',
        to_number: '+2222',
        override_agent_id: 'agent-x',
        retell_llm_dynamic_variables: { name: 'Jane' },
        metadata: { source: 'campaign' },
        agent_override: {
          agent: {
            enable_voicemail_detection: true,
            voicemail_message: 'VM',
            max_call_duration_ms: 90000,
          },
        },
      });
    });

    it('should return null on fetch failure', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
        json: async () => ({}),
      } as Response);

      const result = await service.createOutboundCall({
        fromNumber: '+1111',
        toNumber: '+2222',
      });
      expect(result).toBeNull();
    });
  });

  // ── retellRequest (private, tested via public methods) ───────────────

  describe('retellRequest (via public API)', () => {
    it('should include Authorization header with Bearer token', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellLlmIds: { inbound: 'llm-1' },
      });

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ llm_id: 'llm-1' }),
        text: async () => '',
      } as Response);

      await service.getAccountLlmConfigs('acc-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${FAKE_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('should not include body for GET requests', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ call_id: 'c-1' }),
        text: async () => '',
      } as Response);

      await service.getCall('c-1');

      const fetchOpts = fetchSpy.mock.calls[0][1];
      expect(fetchOpts.body).toBeUndefined();
    });

    it('should throw descriptive error on non-OK response', async () => {
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        retellLlmIds: { inbound: 'llm-1' },
      });

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
        json: async () => ({}),
      } as Response);

      const result = await service.getAccountLlmConfigs('acc-1');
      expect(result!.inbound.error).toContain('503');
      expect(result!.inbound.error).toContain('Service Unavailable');
    });
  });
});
