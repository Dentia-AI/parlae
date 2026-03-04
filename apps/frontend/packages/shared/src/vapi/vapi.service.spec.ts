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
    VAPI_API_KEY: 'test-vapi-key',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

import { createVapiService } from './vapi.service';

function mockOk(data: any) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function mockError(status: number, text = 'Error') {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(text),
  };
}

describe('VapiService', () => {
  describe('isEnabled', () => {
    it('returns true when API key is set', () => {
      const svc = createVapiService();
      expect(svc.isEnabled()).toBe(true);
    });

    it('returns false when API key is missing', () => {
      process.env.VAPI_API_KEY = '';
      const svc = createVapiService();
      expect(svc.isEnabled()).toBe(false);
    });
  });

  describe('when disabled', () => {
    beforeEach(() => {
      process.env.VAPI_API_KEY = '';
    });

    it('createAssistant returns null', async () => {
      const svc = createVapiService();
      const result = await svc.createAssistant({
        name: 'Test',
        voice: { provider: '11labs', voiceId: 'v1' },
        model: { provider: 'openai', model: 'gpt-4', systemPrompt: 'Hello' },
      });
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('getAssistant returns null', async () => {
      const svc = createVapiService();
      expect(await svc.getAssistant('a1')).toBeNull();
    });

    it('deleteAssistant returns false', async () => {
      const svc = createVapiService();
      expect(await svc.deleteAssistant('a1')).toBe(false);
    });

    it('importPhoneNumber returns null', async () => {
      const svc = createVapiService();
      expect(await svc.importPhoneNumber('+1', 'sid', 'token')).toBeNull();
    });

    it('createSquad returns null', async () => {
      const svc = createVapiService();
      expect(await svc.createSquad({ name: 'test', members: [] })).toBeNull();
    });

    it('listCalls returns empty array', async () => {
      const svc = createVapiService();
      expect(await svc.listCalls()).toEqual([]);
    });

    it('listPhoneNumbers returns empty array', async () => {
      const svc = createVapiService();
      expect(await svc.listPhoneNumbers()).toEqual([]);
    });

    it('listSquads returns empty array', async () => {
      const svc = createVapiService();
      expect(await svc.listSquads()).toEqual([]);
    });

    it('listFiles returns empty array', async () => {
      const svc = createVapiService();
      expect(await svc.listFiles()).toEqual([]);
    });

    it('listAssistants returns empty array', async () => {
      const svc = createVapiService();
      expect(await svc.listAssistants()).toEqual([]);
    });

    it('uploadKnowledgeFile returns null', async () => {
      const svc = createVapiService();
      expect(await svc.uploadKnowledgeFile({ name: 'test', content: 'hi' })).toBeNull();
    });

    it('getCall returns null', async () => {
      const svc = createVapiService();
      expect(await svc.getCall('c1')).toBeNull();
    });

    it('deleteFile returns false', async () => {
      const svc = createVapiService();
      expect(await svc.deleteFile('f1')).toBe(false);
    });

    it('deleteSquad returns false', async () => {
      const svc = createVapiService();
      expect(await svc.deleteSquad('s1')).toBe(false);
    });

    it('getCallAnalytics returns null', async () => {
      const svc = createVapiService();
      expect(await svc.getCallAnalytics({ queries: [] })).toBeNull();
    });

    it('listTools returns empty array', async () => {
      const svc = createVapiService();
      expect(await svc.listTools()).toEqual([]);
    });

    it('listCredentials returns empty array', async () => {
      const svc = createVapiService();
      expect(await svc.listCredentials()).toEqual([]);
    });
  });

  describe('createAssistant', () => {
    it('sends correct payload and returns assistant', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'ast-1', name: 'Dental Bot' }));

      const svc = createVapiService();
      const result = await svc.createAssistant({
        name: 'Dental Bot',
        voice: { provider: '11labs', voiceId: 'voice-1' },
        model: {
          provider: 'openai',
          model: 'gpt-4',
          systemPrompt: 'You are a dental assistant.',
          temperature: 0.5,
        },
        firstMessage: 'Hello!',
        serverUrl: 'https://example.com/webhook',
        serverUrlSecret: 'secret-123',
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('ast-1');

      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.vapi.ai/assistant');
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body);
      expect(body.name).toBe('Dental Bot');
      expect(body.firstMessage).toBe('Hello!');
      expect(body.server.url).toBe('https://example.com/webhook');
      expect(body.model.messages[0].content).toBe('You are a dental assistant.');
    });

    it('maps elevenlabs provider to 11labs', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'ast-2' }));

      const svc = createVapiService();
      await svc.createAssistant({
        name: 'Bot',
        voice: { provider: 'elevenlabs', voiceId: 'v1' },
        model: { provider: 'openai', model: 'gpt-4', systemPrompt: 'test' },
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.voice.provider).toBe('11labs');
    });

    it('includes toolIds in model when provided', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'ast-3' }));

      const svc = createVapiService();
      await svc.createAssistant({
        name: 'Bot',
        voice: { provider: '11labs', voiceId: 'v1' },
        model: { provider: 'openai', model: 'gpt-4', systemPrompt: 'test' },
        toolIds: ['tool-1', 'tool-2'],
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.model.toolIds).toEqual(['tool-1', 'tool-2']);
    });

    it('includes analysisPlan when provided', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'ast-4' }));

      const svc = createVapiService();
      await svc.createAssistant({
        name: 'Bot',
        voice: { provider: '11labs', voiceId: 'v1' },
        model: { provider: 'openai', model: 'gpt-4', systemPrompt: 'test' },
        analysisPlan: { summaryPlan: { enabled: true } },
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.analysisPlan.summaryPlan.enabled).toBe(true);
    });

    it('uses credentialId for server config when provided', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'ast-5' }));

      const svc = createVapiService();
      await svc.createAssistant({
        name: 'Bot',
        voice: { provider: '11labs', voiceId: 'v1' },
        model: { provider: 'openai', model: 'gpt-4', systemPrompt: 'test' },
        serverUrl: 'https://example.com/hook',
        credentialId: 'cred-123',
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.server.credentialId).toBe('cred-123');
      expect(body.server.secret).toBeUndefined();
    });

    it('returns null on API error', async () => {
      mockFetch.mockResolvedValue(mockError(400, 'Bad Request'));

      const svc = createVapiService();
      const result = await svc.createAssistant({
        name: 'Bot',
        voice: { provider: '11labs', voiceId: 'v1' },
        model: { provider: 'openai', model: 'gpt-4', systemPrompt: 'test' },
      });

      expect(result).toBeNull();
    });

    it('returns null on exception', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const svc = createVapiService();
      const result = await svc.createAssistant({
        name: 'Bot',
        voice: { provider: '11labs', voiceId: 'v1' },
        model: { provider: 'openai', model: 'gpt-4', systemPrompt: 'test' },
      });

      expect(result).toBeNull();
    });

    it('retries on 429 and 500 errors', async () => {
      mockFetch
        .mockResolvedValueOnce(mockError(429, 'Rate limited'))
        .mockResolvedValueOnce(mockOk({ id: 'ast-retry' }));

      const svc = createVapiService();
      const result = await svc.createAssistant({
        name: 'Bot',
        voice: { provider: '11labs', voiceId: 'v1' },
        model: { provider: 'openai', model: 'gpt-4', systemPrompt: 'test' },
      });

      expect(result!.id).toBe('ast-retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAssistant', () => {
    it('fetches assistant by ID', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'ast-1', name: 'Bot' }));

      const svc = createVapiService();
      const result = await svc.getAssistant('ast-1');

      expect(result!.id).toBe('ast-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vapi.ai/assistant/ast-1',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns null on error', async () => {
      mockFetch.mockResolvedValue(mockError(404));

      const svc = createVapiService();
      expect(await svc.getAssistant('missing')).toBeNull();
    });
  });

  describe('deleteAssistant', () => {
    it('sends DELETE and returns true', async () => {
      mockFetch.mockResolvedValue(mockOk({}));

      const svc = createVapiService();
      const result = await svc.deleteAssistant('ast-1');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vapi.ai/assistant/ast-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('returns false on error', async () => {
      mockFetch.mockResolvedValue(mockError(500));

      const svc = createVapiService();
      expect(await svc.deleteAssistant('ast-1')).toBe(false);
    });
  });

  describe('updateAssistant', () => {
    it('sends PATCH and returns updated assistant', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'ast-1', name: 'Updated' }));

      const svc = createVapiService();
      const result = await svc.updateAssistant('ast-1', { name: 'Updated' });

      expect(result!.name).toBe('Updated');
    });
  });

  describe('importPhoneNumber', () => {
    it('sends correct payload with assistantId', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'pn-1', number: '+14165551234' }));

      const svc = createVapiService();
      const result = await svc.importPhoneNumber(
        '+14165551234',
        'twilio-sid',
        'twilio-token',
        'ast-1',
      );

      expect(result).not.toBeNull();
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.provider).toBe('twilio');
      expect(body.number).toBe('+14165551234');
      expect(body.assistantId).toBe('ast-1');
    });

    it('sends squadId when isSquad is true', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'pn-2' }));

      const svc = createVapiService();
      await svc.importPhoneNumber('+1', 'sid', 'token', 'squad-1', true);

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.squadId).toBe('squad-1');
      expect(body.assistantId).toBeUndefined();
    });
  });

  describe('createSquad', () => {
    it('creates assistants then assembles squad', async () => {
      // First call: create assistant
      mockFetch
        .mockResolvedValueOnce(mockOk({ id: 'ast-squad-1', name: 'Member 1' }))
        // Second call: create squad
        .mockResolvedValueOnce(mockOk({ id: 'squad-1', name: 'Test Squad' }));

      const svc = createVapiService();
      const result = await svc.createSquad({
        name: 'Test Squad',
        members: [{
          assistant: {
            name: 'Member 1',
            voice: { provider: '11labs', voiceId: 'v1' },
            model: { provider: 'openai', model: 'gpt-4', systemPrompt: 'test' },
          },
        }],
      });

      expect(result!.id).toBe('squad-1');
    });

    it('uses existing assistantId when provided', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'squad-2', name: 'Squad 2' }));

      const svc = createVapiService();
      const result = await svc.createSquad({
        name: 'Squad 2',
        members: [{ assistantId: 'existing-ast-1' }],
      });

      expect(result!.id).toBe('squad-2');
      // Should only be called once (squad creation), not for assistant creation
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('cleans up created assistants on failure', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOk({ id: 'ast-cleanup-1' })) // first assistant
        .mockResolvedValueOnce(mockOk(null)) // second assistant fails -> null
        .mockResolvedValueOnce(mockOk({})); // cleanup delete

      const svc = createVapiService();
      const result = await svc.createSquad({
        name: 'Failing Squad',
        members: [
          {
            assistant: {
              name: 'A',
              voice: { provider: '11labs', voiceId: 'v1' },
              model: { provider: 'openai', model: 'gpt-4', systemPrompt: 'a' },
            },
          },
          {
            assistant: {
              name: 'B',
              voice: { provider: '11labs', voiceId: 'v2' },
              model: { provider: 'openai', model: 'gpt-4', systemPrompt: 'b' },
            },
          },
        ],
      });

      expect(result).toBeNull();
    });
  });

  describe('getCall', () => {
    it('fetches call by ID', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'call-1', status: 'ended' }));

      const svc = createVapiService();
      const result = await svc.getCall('call-1');

      expect(result!.id).toBe('call-1');
    });
  });

  describe('listCalls', () => {
    it('returns array of calls', async () => {
      mockFetch.mockResolvedValue(mockOk([{ id: 'c1' }, { id: 'c2' }]));

      const svc = createVapiService();
      const result = await svc.listCalls({ limit: 10 });

      expect(result).toHaveLength(2);
    });

    it('handles paginated results format', async () => {
      mockFetch.mockResolvedValue(mockOk({ results: [{ id: 'c1' }] }));

      const svc = createVapiService();
      const result = await svc.listCalls();

      expect(result).toHaveLength(1);
    });

    it('passes filter params as query string', async () => {
      mockFetch.mockResolvedValue(mockOk([]));

      const svc = createVapiService();
      await svc.listCalls({
        phoneNumberId: 'pn-1',
        assistantId: 'ast-1',
        limit: 5,
      });

      const url = mockFetch.mock.calls[0]![0] as string;
      expect(url).toContain('phoneNumberId=pn-1');
      expect(url).toContain('assistantId=ast-1');
      expect(url).toContain('limit=5');
    });
  });

  describe('listPhoneNumbers', () => {
    it('returns array of phone numbers', async () => {
      mockFetch.mockResolvedValue(mockOk([{ id: 'pn-1' }]));

      const svc = createVapiService();
      const result = await svc.listPhoneNumbers();
      expect(result).toHaveLength(1);
    });
  });

  describe('uploadKnowledgeFile', () => {
    it('uploads text content via multipart form', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'file-1' }));

      const svc = createVapiService();
      const result = await svc.uploadKnowledgeFile({
        name: 'test.txt',
        content: 'Hello world',
      });

      expect(result).toBe('file-1');
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.vapi.ai/file');
      expect(opts.method).toBe('POST');
    });

    it('downloads from URL then uploads', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        })
        .mockResolvedValueOnce(mockOk({ id: 'file-2' }));

      const svc = createVapiService();
      const result = await svc.uploadKnowledgeFile({
        name: 'remote.pdf',
        url: 'https://example.com/file.pdf',
      });

      expect(result).toBe('file-2');
    });

    it('returns null when no content or URL', async () => {
      const svc = createVapiService();
      const result = await svc.uploadKnowledgeFile({ name: 'empty' });
      expect(result).toBeNull();
    });
  });

  describe('deleteFile', () => {
    it('sends DELETE and returns true', async () => {
      mockFetch.mockResolvedValue(mockOk({}));

      const svc = createVapiService();
      expect(await svc.deleteFile('f1')).toBe(true);
    });
  });

  describe('getFile', () => {
    it('fetches file by ID', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'f1', name: 'doc.pdf' }));

      const svc = createVapiService();
      const result = await svc.getFile('f1');
      expect(result.name).toBe('doc.pdf');
    });
  });

  describe('updateAssistantSystemPrompt', () => {
    it('fetches existing assistant and patches model', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOk({
          id: 'ast-1',
          name: 'Bot',
          model: { provider: 'openai', model: 'gpt-4', messages: [{ role: 'system', content: 'old' }] },
        }))
        .mockResolvedValueOnce(mockOk({ id: 'ast-1' }));

      const svc = createVapiService();
      const result = await svc.updateAssistantSystemPrompt('ast-1', 'New system prompt');

      expect(result.success).toBe(true);
      expect(result.assistantName).toBe('Bot');
    });

    it('returns failure when assistant not found', async () => {
      mockFetch.mockResolvedValue(mockError(404));

      const svc = createVapiService();
      const result = await svc.updateAssistantSystemPrompt('missing', 'prompt');

      expect(result.success).toBe(false);
    });
  });

  describe('getCallAnalytics', () => {
    it('sends POST to analytics endpoint', async () => {
      mockFetch.mockResolvedValue(mockOk({ result: [] }));

      const svc = createVapiService();
      const result = await svc.getCallAnalytics({
        queries: [{ table: 'call', name: 'test', operations: [{ operation: 'count', column: 'id' }] }],
      });

      expect(result).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vapi.ai/analytics',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('authorization header', () => {
    it('includes Bearer token in all requests', async () => {
      mockFetch.mockResolvedValue(mockOk([]));

      const svc = createVapiService();
      await svc.listAssistants();

      const headers = mockFetch.mock.calls[0]![1].headers;
      expect(headers.Authorization).toBe('Bearer test-vapi-key');
    });
  });

  describe('deleteSquad', () => {
    it('sends DELETE and returns true', async () => {
      mockFetch.mockResolvedValue(mockOk({}));

      const svc = createVapiService();
      expect(await svc.deleteSquad('sq-1')).toBe(true);
    });

    it('returns false on error', async () => {
      mockFetch.mockResolvedValue(mockError(500));

      const svc = createVapiService();
      expect(await svc.deleteSquad('sq-1')).toBe(false);
    });
  });

  describe('listSquads', () => {
    it('returns array of squads', async () => {
      mockFetch.mockResolvedValue(mockOk([{ id: 'sq-1' }]));

      const svc = createVapiService();
      const result = await svc.listSquads();
      expect(result).toHaveLength(1);
    });
  });

  describe('getSquad', () => {
    it('fetches squad by ID', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'sq-1', name: 'Squad' }));

      const svc = createVapiService();
      const result = await svc.getSquad('sq-1');
      expect(result!.id).toBe('sq-1');
    });

    it('returns null on error', async () => {
      mockFetch.mockResolvedValue(mockError(404));

      const svc = createVapiService();
      expect(await svc.getSquad('missing')).toBeNull();
    });
  });

  describe('updatePhoneNumber', () => {
    it('sends PATCH with assistantId', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'pn-1' }));

      const svc = createVapiService();
      const result = await svc.updatePhoneNumber('pn-1', 'ast-new');

      expect(result!.id).toBe('pn-1');
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.assistantId).toBe('ast-new');
    });

    it('sends squadId when isSquad is true', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'pn-1' }));

      const svc = createVapiService();
      await svc.updatePhoneNumber('pn-1', 'squad-1', true);

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.squadId).toBe('squad-1');
    });
  });

  describe('structured output management', () => {
    it('createStructuredOutput sends POST', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'so-1', name: 'output' }));

      const svc = createVapiService();
      const result = await svc.createStructuredOutput({
        name: 'call-analysis',
        schema: { type: 'object', properties: {} },
      });

      expect(result!.id).toBe('so-1');
    });

    it('listStructuredOutputs handles paginated response', async () => {
      mockFetch.mockResolvedValue(mockOk({ results: [{ id: 'so-1' }] }));

      const svc = createVapiService();
      const result = await svc.listStructuredOutputs();
      expect(result).toHaveLength(1);
    });
  });

  describe('standalone tool management', () => {
    it('createStandaloneTool sends POST', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 'tool-1' }));

      const svc = createVapiService();
      const result = await svc.createStandaloneTool({
        type: 'function',
        function: { name: 'test', description: 'test', parameters: { type: 'object', properties: {} } },
      });

      expect(result!.id).toBe('tool-1');
    });

    it('listTools handles different response shapes', async () => {
      mockFetch.mockResolvedValue(mockOk({ data: [{ id: 't1' }] }));

      const svc = createVapiService();
      const result = await svc.listTools();
      expect(result).toHaveLength(1);
    });

    it('deleteTool sends DELETE and returns true', async () => {
      mockFetch.mockResolvedValue(mockOk({}));

      const svc = createVapiService();
      expect(await svc.deleteTool('t1')).toBe(true);
    });

    it('updateTool sends PATCH', async () => {
      mockFetch.mockResolvedValue(mockOk({ id: 't1' }));

      const svc = createVapiService();
      const result = await svc.updateTool('t1', { server: { url: 'https://new.com' } });
      expect(result!.id).toBe('t1');
    });
  });
});
