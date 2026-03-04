jest.mock('server-only', () => ({}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    RETELL_API_KEY: 'test-retell-key',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

import { RetellService, createRetellService } from './retell.service';

function mockOk(data: any, status = 200) {
  return {
    ok: true,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function mock204() {
  return { ok: true, status: 204, json: () => Promise.resolve(null), text: () => Promise.resolve('') };
}

function mockError(status: number, text = 'Error') {
  return { ok: false, status, json: () => Promise.resolve({}), text: () => Promise.resolve(text) };
}

describe('RetellService', () => {
  describe('isEnabled', () => {
    it('returns true when API key is set', () => {
      const svc = new RetellService();
      expect(svc.isEnabled()).toBe(true);
    });

    it('returns false when API key is missing', () => {
      process.env.RETELL_API_KEY = '';
      const svc = new RetellService();
      expect(svc.isEnabled()).toBe(false);
    });
  });

  describe('createRetellService (factory)', () => {
    it('returns a RetellService instance', () => {
      const svc = createRetellService();
      expect(svc).toBeInstanceOf(RetellService);
    });
  });

  describe('when disabled', () => {
    beforeEach(() => {
      process.env.RETELL_API_KEY = '';
    });

    it('createAgent returns null', async () => {
      const svc = new RetellService();
      const result = await svc.createAgent({ voice_id: 'v1', response_engine: { type: 'retell-llm', llm_id: 'llm-1' } });
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('getAgent returns null', async () => {
      const svc = new RetellService();
      expect(await svc.getAgent('agent-1')).toBeNull();
    });

    it('listAgents returns empty array', async () => {
      const svc = new RetellService();
      expect(await svc.listAgents()).toEqual([]);
    });

    it('listCalls returns empty array', async () => {
      const svc = new RetellService();
      expect(await svc.listCalls()).toEqual([]);
    });

    it('listPhoneNumbers returns empty array', async () => {
      const svc = new RetellService();
      expect(await svc.listPhoneNumbers()).toEqual([]);
    });

    it('listKnowledgeBases returns empty array', async () => {
      const svc = new RetellService();
      expect(await svc.listKnowledgeBases()).toEqual([]);
    });

    it('createKnowledgeBase returns null', async () => {
      const svc = new RetellService();
      expect(await svc.createKnowledgeBase({ name: 'test' })).toBeNull();
    });
  });

  describe('LLM management', () => {
    it('createRetellLlm sends POST with config', async () => {
      mockFetch.mockResolvedValue(mockOk({ llm_id: 'llm-1', version: 1 }));

      const svc = new RetellService();
      const result = await svc.createRetellLlm({ general_prompt: 'Hello' });

      expect(result).not.toBeNull();
      expect(result!.llm_id).toBe('llm-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.retellai.com/create-retell-llm',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('getRetellLlm sends GET request', async () => {
      mockFetch.mockResolvedValue(mockOk({ llm_id: 'llm-1', version: 1 }));

      const svc = new RetellService();
      const result = await svc.getRetellLlm('llm-1');

      expect(result!.llm_id).toBe('llm-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.retellai.com/get-retell-llm/llm-1',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('updateRetellLlm sends PATCH request', async () => {
      mockFetch.mockResolvedValue(mockOk({ llm_id: 'llm-1', version: 2 }));

      const svc = new RetellService();
      const result = await svc.updateRetellLlm('llm-1', { general_prompt: 'Updated' });

      expect(result!.version).toBe(2);
    });

    it('deleteRetellLlm sends DELETE request', async () => {
      mockFetch.mockResolvedValue(mock204());

      const svc = new RetellService();
      await svc.deleteRetellLlm('llm-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.retellai.com/delete-retell-llm/llm-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('Agent management', () => {
    it('createAgent sends POST with config', async () => {
      const config = {
        agent_name: 'Test Agent',
        voice_id: 'voice-1',
        response_engine: { type: 'retell-llm' as const, llm_id: 'llm-1' },
      };

      mockFetch.mockResolvedValue(mockOk({ agent_id: 'agent-1', version: 1 }));

      const svc = new RetellService();
      const result = await svc.createAgent(config);

      expect(result!.agent_id).toBe('agent-1');

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.agent_name).toBe('Test Agent');
    });

    it('getAgent fetches agent by ID', async () => {
      mockFetch.mockResolvedValue(mockOk({ agent_id: 'agent-1', agent_name: 'Test' }));

      const svc = new RetellService();
      const result = await svc.getAgent('agent-1');

      expect(result!.agent_id).toBe('agent-1');
    });

    it('updateAgent sends PATCH request', async () => {
      mockFetch.mockResolvedValue(mockOk({ agent_id: 'agent-1', version: 2 }));

      const svc = new RetellService();
      const result = await svc.updateAgent('agent-1', { agent_name: 'Updated' });

      expect(result!.version).toBe(2);
    });

    it('deleteAgent sends DELETE request', async () => {
      mockFetch.mockResolvedValue(mock204());

      const svc = new RetellService();
      await svc.deleteAgent('agent-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.retellai.com/delete-agent/agent-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('listAgents returns array', async () => {
      mockFetch.mockResolvedValue(mockOk([
        { agent_id: 'a1' },
        { agent_id: 'a2' },
      ]));

      const svc = new RetellService();
      const result = await svc.listAgents();

      expect(result).toHaveLength(2);
    });

    it('listAgents returns empty array on null result', async () => {
      mockFetch.mockResolvedValue(mock204());

      const svc = new RetellService();
      const result = await svc.listAgents();
      expect(result).toEqual([]);
    });
  });

  describe('Phone number management', () => {
    it('importPhoneNumber sends correct payload', async () => {
      mockFetch.mockResolvedValue(mockOk({
        phone_number: '+14165551234',
        phone_number_pretty: '(416) 555-1234',
      }));

      const svc = new RetellService();
      const result = await svc.importPhoneNumber({
        phoneNumber: '+14165551234',
        terminationUri: 'parlae.pstn.twilio.com',
        inboundAgentId: 'agent-1',
        nickname: 'Main Line',
      });

      expect(result!.phone_number).toBe('+14165551234');

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.phone_number).toBe('+14165551234');
      expect(body.termination_uri).toBe('parlae.pstn.twilio.com');
      expect(body.inbound_agent_id).toBe('agent-1');
    });

    it('listPhoneNumbers returns array', async () => {
      mockFetch.mockResolvedValue(mockOk([
        { phone_number: '+14165551234' },
      ]));

      const svc = new RetellService();
      const result = await svc.listPhoneNumbers();
      expect(result).toHaveLength(1);
    });

    it('updatePhoneNumber sends PATCH', async () => {
      mockFetch.mockResolvedValue(mockOk({ phone_number: '+14165551234' }));

      const svc = new RetellService();
      await svc.updatePhoneNumber('+14165551234', { inbound_agent_id: 'agent-2' });

      const url = mockFetch.mock.calls[0]![0];
      expect(url).toContain('/update-phone-number/');
    });

    it('deletePhoneNumber sends DELETE', async () => {
      mockFetch.mockResolvedValue(mock204());

      const svc = new RetellService();
      await svc.deletePhoneNumber('+14165551234');

      const url = mockFetch.mock.calls[0]![0];
      expect(url).toContain('/delete-phone-number/');
    });
  });

  describe('Call management', () => {
    it('getCall fetches call by ID', async () => {
      mockFetch.mockResolvedValue(mockOk({
        call_id: 'call-1',
        call_status: 'ended',
        transcript: 'Hello world',
      }));

      const svc = new RetellService();
      const result = await svc.getCall('call-1');

      expect(result!.call_id).toBe('call-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.retellai.com/v2/get-call/call-1',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('listCalls sends POST to v2 endpoint', async () => {
      mockFetch.mockResolvedValue(mockOk([{ call_id: 'c1' }]));

      const svc = new RetellService();
      const result = await svc.listCalls({ limit: 10 });

      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.retellai.com/v2/list-calls',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('createOutboundCall sends correct payload', async () => {
      mockFetch.mockResolvedValue(mockOk({ call_id: 'out-1' }));

      const svc = new RetellService();
      const result = await svc.createOutboundCall({
        fromNumber: '+14165550000',
        toNumber: '+14165551111',
        overrideAgentId: 'agent-1',
        dynamicVariables: { patient_name: 'John' },
      });

      expect(result!.call_id).toBe('out-1');

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.from_number).toBe('+14165550000');
      expect(body.to_number).toBe('+14165551111');
      expect(body.override_agent_id).toBe('agent-1');
      expect(body.retell_llm_dynamic_variables.patient_name).toBe('John');
    });

    it('createOutboundCall includes voicemail config', async () => {
      mockFetch.mockResolvedValue(mockOk({ call_id: 'out-2' }));

      const svc = new RetellService();
      await svc.createOutboundCall({
        fromNumber: '+1',
        toNumber: '+2',
        voicemailMessage: 'Please call back',
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.agent_override.agent.enable_voicemail_detection).toBe(true);
      expect(body.agent_override.agent.voicemail_message).toBe('Please call back');
    });
  });

  describe('Knowledge base management', () => {
    it('createKnowledgeBase sends multipart form data', async () => {
      mockFetch.mockResolvedValue(mockOk({
        knowledge_base_id: 'kb-1',
        knowledge_base_name: 'test-kb',
        status: 'in_progress',
      }));

      const svc = new RetellService();
      const result = await svc.createKnowledgeBase({
        name: 'test-kb',
        texts: [{ title: 'FAQ', text: 'Q: What? A: That.' }],
      });

      expect(result!.knowledge_base_id).toBe('kb-1');

      const url = mockFetch.mock.calls[0]![0];
      expect(url).toBe('https://api.retellai.com/create-knowledge-base');
    });

    it('getKnowledgeBase fetches by ID', async () => {
      mockFetch.mockResolvedValue(mockOk({
        knowledge_base_id: 'kb-1',
        status: 'complete',
      }));

      const svc = new RetellService();
      const result = await svc.getKnowledgeBase('kb-1');
      expect(result!.status).toBe('complete');
    });

    it('deleteKnowledgeBase sends DELETE', async () => {
      mockFetch.mockResolvedValue(mock204());

      const svc = new RetellService();
      await svc.deleteKnowledgeBase('kb-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.retellai.com/delete-knowledge-base/kb-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('listKnowledgeBases returns array', async () => {
      mockFetch.mockResolvedValue(mockOk([{ knowledge_base_id: 'kb-1' }]));

      const svc = new RetellService();
      const result = await svc.listKnowledgeBases();
      expect(result).toHaveLength(1);
    });

    it('waitForKnowledgeBase polls until complete', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOk({ knowledge_base_id: 'kb-1', status: 'in_progress' }))
        .mockResolvedValueOnce(mockOk({ knowledge_base_id: 'kb-1', status: 'complete' }));

      const svc = new RetellService();
      const result = await svc.waitForKnowledgeBase('kb-1', 10000, 10);

      expect(result!.status).toBe('complete');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('waitForKnowledgeBase returns on error status', async () => {
      mockFetch.mockResolvedValue(mockOk({ knowledge_base_id: 'kb-1', status: 'error' }));

      const svc = new RetellService();
      const result = await svc.waitForKnowledgeBase('kb-1', 5000, 10);

      expect(result!.status).toBe('error');
    });

    it('waitForKnowledgeBase returns null when KB not found', async () => {
      mockFetch.mockResolvedValue(mock204());

      const svc = new RetellService();
      const result = await svc.waitForKnowledgeBase('missing', 1000, 10);
      expect(result).toBeNull();
    });
  });

  describe('Conversation flow management', () => {
    it('createConversationFlow sends POST', async () => {
      mockFetch.mockResolvedValue(mockOk({ conversation_flow_id: 'cf-1', version: 1 }));

      const svc = new RetellService();
      const result = await svc.createConversationFlow({
        start_speaker: 'agent',
        model_choice: { type: 'cascading', model: 'gpt-4' },
        start_node_id: 'node-1',
        nodes: [],
      });

      expect(result!.conversation_flow_id).toBe('cf-1');
    });

    it('deleteConversationFlow sends DELETE', async () => {
      mockFetch.mockResolvedValue(mock204());

      const svc = new RetellService();
      await svc.deleteConversationFlow('cf-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.retellai.com/delete-conversation-flow/cf-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('Web call management', () => {
    it('createWebCall sends POST with agentId', async () => {
      mockFetch.mockResolvedValue(mockOk({ call_id: 'wc-1', access_token: 'token-1' }));

      const svc = new RetellService();
      const result = await svc.createWebCall({ agentId: 'agent-1' });

      expect(result!.call_id).toBe('wc-1');
      expect(result!.access_token).toBe('token-1');
    });
  });

  describe('error handling and retries', () => {
    it('retries on 429 with backoff', async () => {
      mockFetch
        .mockResolvedValueOnce(mockError(429, 'Rate limited'))
        .mockResolvedValueOnce(mockOk({ agent_id: 'a1' }));

      const svc = new RetellService();
      const result = await svc.getAgent('a1');

      expect(result!.agent_id).toBe('a1');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws on non-ok non-429 responses', async () => {
      mockFetch.mockResolvedValue(mockError(500, 'Server Error'));

      const svc = new RetellService();
      await expect(svc.getAgent('a1')).rejects.toThrow('Retell GET /get-agent/a1 (500)');
    });

    it('includes Authorization header', async () => {
      mockFetch.mockResolvedValue(mockOk([]));

      const svc = new RetellService();
      await svc.listAgents();

      const headers = mockFetch.mock.calls[0]![1].headers;
      expect(headers.Authorization).toBe('Bearer test-retell-key');
    });
  });
});
