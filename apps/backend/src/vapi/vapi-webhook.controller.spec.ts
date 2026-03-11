import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { VapiWebhookController } from './vapi-webhook.controller';
import { AgentToolsService } from '../agent-tools/agent-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';

/** Return a YYYY-MM-DD string 30 days in the future so date-validation never trips. */
const futureDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

const futureDateTime = () => `${futureDate()}T10:00:00Z`;

describe('VapiWebhookController', () => {
  let controller: VapiWebhookController;
  let agentToolsService: any;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const mockAgentTools = {
      lookupPatient: jest.fn().mockResolvedValue({ result: { success: true } }),
      createPatient: jest.fn().mockResolvedValue({ result: { success: true } }),
      bookAppointment: jest.fn().mockResolvedValue({ result: { success: true } }),
      checkAvailability: jest.fn().mockResolvedValue({ result: { success: true } }),
      cancelAppointment: jest.fn().mockResolvedValue({ result: { success: true } }),
      rescheduleAppointment: jest.fn().mockResolvedValue({ result: { success: true } }),
      getAppointments: jest.fn().mockResolvedValue({ result: { success: true } }),
      transferToHuman: jest.fn().mockResolvedValue({ result: { success: true } }),
      takeMessage: jest.fn().mockResolvedValue({ result: { success: true } }),
      updatePatient: jest.fn().mockResolvedValue({ result: { success: true } }),
      addPatientNote: jest.fn().mockResolvedValue({ result: { success: true } }),
      getPatientInsurance: jest.fn().mockResolvedValue({ result: { success: true } }),
      getPatientBalance: jest.fn().mockResolvedValue({ result: { success: true } }),
      saveInsurance: jest.fn().mockResolvedValue({ result: { success: true } }),
      verifyInsuranceCoverage: jest.fn().mockResolvedValue({ result: { success: true } }),
      getPaymentHistory: jest.fn().mockResolvedValue({ result: { success: true } }),
      processPayment: jest.fn().mockResolvedValue({ result: { success: true } }),
      createPaymentPlan: jest.fn().mockResolvedValue({ result: { success: true } }),
      getProviders: jest.fn().mockResolvedValue({ result: { success: true } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VapiWebhookController],
      providers: [
        { provide: AgentToolsService, useValue: mockAgentTools },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<VapiWebhookController>(VapiWebhookController);
    agentToolsService = module.get(AgentToolsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.VAPI_WEBHOOK_SECRET;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook - authentication', () => {
    it('should reject when secret is set and no auth provided', async () => {
      process.env.VAPI_WEBHOOK_SECRET = 'test-secret';
      await expect(
        controller.handleWebhook({ message: { type: 'status-update' } }, '', ''),
      ).rejects.toThrow(HttpException);
    });

    it('should accept when x-vapi-secret matches', async () => {
      process.env.VAPI_WEBHOOK_SECRET = 'test-secret';
      const result = await controller.handleWebhook(
        { message: { type: 'speech-update' } },
        'test-secret',
        '',
      );
      expect(result).toEqual({ received: true });
    });

    it('should accept when bearer token matches', async () => {
      process.env.VAPI_WEBHOOK_SECRET = 'test-secret';
      const result = await controller.handleWebhook(
        { message: { type: 'speech-update' } },
        '',
        'Bearer test-secret',
      );
      expect(result).toEqual({ received: true });
    });
  });

  describe('handleWebhook - routing', () => {
    it('should handle function-call', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-1', phoneNumberId: 'pn-1' },
          functionCall: { name: 'checkAvailability', parameters: { date: futureDate() } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as { results?: Array<{ result: string }> };
      expect(result.results).toBeDefined();
    });

    it('should handle status-update', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({ accountId: 'acc-1' });
      prisma.callReference.upsert.mockResolvedValue({});

      const result = await controller.handleWebhook(
        { message: { type: 'status-update', status: 'in-progress', call: { id: 'call-1', phoneNumberId: 'pn-1' } } },
        '',
        '',
      );
      expect(result).toEqual({ received: true });
    });

    it('should handle end-of-call-report', async () => {
      const result = await controller.handleWebhook(
        { message: { type: 'end-of-call-report', call: { id: 'call-1' } } },
        '',
        '',
      );
      expect(result).toEqual({ received: true });
    });

    it('should handle unknown event type', async () => {
      const result = await controller.handleWebhook(
        { message: { type: 'unknown-type' } },
        '',
        '',
      );
      expect(result).toEqual({ received: true });
    });
  });

  describe('handleWebhook - function-call dispatch', () => {
    const makeFunctionPayload = (name: string, params: Record<string, any> = {}) => ({
      message: {
        type: 'function-call',
        call: { id: 'call-test', phoneNumberId: 'pn-1' },
        functionCall: { id: 'tc-1', name, parameters: params },
        assistant: { metadata: { accountId: 'acc-1' } },
      },
    });

    it('should dispatch lookupPatient', async () => {
      const result = (await controller.handleWebhook(
        makeFunctionPayload('lookupPatient', { query: 'John' }),
        '',
        '',
      )) as { results?: Array<{ result: string }> };
      expect(result.results).toBeDefined();
      expect(agentToolsService.lookupPatient).toHaveBeenCalled();
    });

    it('should dispatch bookAppointment', async () => {
      const result = await controller.handleWebhook(
        makeFunctionPayload('bookAppointment', { patientId: 'p-1', startTime: futureDateTime(), email: 'a@b.com' }),
        '',
        '',
      );
      expect(agentToolsService.bookAppointment).toHaveBeenCalled();
    });

    it('should return error for unknown tool', async () => {
      const result = (await controller.handleWebhook(
        makeFunctionPayload('nonexistentTool', {}),
        '',
        '',
      )) as { results: Array<{ result: string }> };
      expect(result.results[0].result).toContain('Unknown tool');
    });

    it('should return error for missing tool name', async () => {
      const result = (await controller.handleWebhook({
        message: {
          type: 'function-call',
          call: { id: 'call-1' },
          functionCall: { id: 'tc-1' },
        },
      }, '', '')) as { results: Array<{ result: string }> };
      expect(result.results[0].result).toContain('Missing tool name');
    });
  });

  describe('handleWebhook - validation', () => {
    it('should reject bookAppointment without patientId', async () => {
      const result = (await controller.handleWebhook({
        message: {
          type: 'function-call',
          call: { id: 'call-v', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'bookAppointment', parameters: {} },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      }, '', '')) as { results: Array<{ result: string }> };
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(agentToolsService.bookAppointment).not.toHaveBeenCalled();
    });

    it('should reject checkAvailability with invalid date format', async () => {
      const result = (await controller.handleWebhook({
        message: {
          type: 'function-call',
          call: { id: 'call-v2', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'checkAvailability', parameters: { date: 'tomorrow' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      }, '', '')) as { results: Array<{ result: string }> };
      expect(result.results[0].result).toContain('YYYY-MM-DD');
    });

    it('should reject createPatient without name', async () => {
      const result = (await controller.handleWebhook({
        message: {
          type: 'function-call',
          call: { id: 'call-v3', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'createPatient', parameters: {} },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      }, '', '')) as { results: Array<{ result: string }> };
      expect(result.results[0].result).toContain('VALIDATION ERROR');
    });

    it('should reject template variables in parameters', async () => {
      const result = (await controller.handleWebhook({
        message: {
          type: 'function-call',
          call: { id: 'call-v4', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: '{{call.customer.number}}' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      }, '', '')) as { results: Array<{ result: string }> };
      expect(result.results[0].result).toContain('VALIDATION ERROR');
    });
  });

  describe('getToolCallHistory', () => {
    it('should return 404 when test endpoints not enabled', () => {
      delete process.env.ENABLE_TEST_ENDPOINTS;
      expect(() => controller.getToolCallHistory('call-1')).toThrow(HttpException);
    });

    it('should return history when enabled', () => {
      process.env.ENABLE_TEST_ENDPOINTS = 'true';
      const result = controller.getToolCallHistory('call-1');
      expect(result).toHaveProperty('callId', 'call-1');
      expect(result).toHaveProperty('toolCalls');
      delete process.env.ENABLE_TEST_ENDPOINTS;
    });
  });

  describe('handleWebhook - authentication edge cases', () => {
    it('should reject when secret is set and wrong secret provided', async () => {
      process.env.VAPI_WEBHOOK_SECRET = 'test-secret';
      await expect(
        controller.handleWebhook(
          { message: { type: 'status-update' } },
          'wrong-secret',
          'Bearer wrong-secret',
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should use VAPI_SERVER_SECRET when VAPI_WEBHOOK_SECRET is not set', async () => {
      process.env.VAPI_SERVER_SECRET = 'server-secret';
      const result = await controller.handleWebhook(
        { message: { type: 'speech-update' } },
        'server-secret',
        '',
      );
      expect(result).toEqual({ received: true });
      delete process.env.VAPI_SERVER_SECRET;
    });
  });

  describe('handleWebhook - assistant-request routing', () => {
    it('should handle assistant-request', async () => {
      const result = await controller.handleWebhook(
        { message: { type: 'assistant-request' } },
        '',
        '',
      );
      expect(result).toEqual({ received: true });
    });
  });

  describe('handleWebhook - tool-calls format', () => {
    it('should handle tool-calls with multiple tool invocations', async () => {
      const payload = {
        message: {
          type: 'tool-calls',
          call: { id: 'call-tc', phoneNumberId: 'pn-1' },
          toolCallList: [
            { id: 'tc-1', function: { name: 'checkAvailability', arguments: JSON.stringify({ date: futureDate() }) } },
            { id: 'tc-2', function: { name: 'lookupPatient', arguments: '{"query":"Jane"}' } },
          ],
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results).toBeDefined();
      expect(result.results.length).toBe(2);
      expect(agentToolsService.checkAvailability).toHaveBeenCalled();
      expect(agentToolsService.lookupPatient).toHaveBeenCalled();
    });

    it('should handle tool-calls with empty toolCallList', async () => {
      const payload = {
        message: {
          type: 'tool-calls',
          call: { id: 'call-tc-empty' },
          toolCallList: [],
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results).toEqual([]);
    });

    it('should handle tool-calls with tc.function fallback', async () => {
      const payload = {
        message: {
          type: 'tool-calls',
          call: { id: 'call-tc-fb', phoneNumberId: 'pn-1' },
          toolCallList: [
            { id: 'tc-1', name: 'lookupPatient', arguments: '{"query":"test"}' },
          ],
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results).toBeDefined();
    });
  });

  describe('handleWebhook - arguments parsing', () => {
    it('should parse JSON string arguments', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-args', phoneNumberId: 'pn-1' },
          functionCall: {
            id: 'tc-1',
            name: 'lookupPatient',
            parameters: {},
            arguments: '{"query":"John"}',
          },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results).toBeDefined();
      expect(agentToolsService.lookupPatient).toHaveBeenCalled();
    });

    it('should handle already-parsed arguments object', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-args2', phoneNumberId: 'pn-1' },
          functionCall: {
            id: 'tc-1',
            name: 'lookupPatient',
            parameters: {},
            arguments: { query: 'John' },
          },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results).toBeDefined();
      expect(agentToolsService.lookupPatient).toHaveBeenCalled();
    });

    it('should handle malformed JSON arguments gracefully', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-bad-json', phoneNumberId: 'pn-1' },
          functionCall: {
            id: 'tc-1',
            name: 'lookupPatient',
            parameters: {},
            arguments: '{bad json',
          },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results).toBeDefined();
    });

    it('should use empty params when no arguments or parameters', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-no-args', phoneNumberId: 'pn-1' },
          functionCall: {
            id: 'tc-1',
            name: 'lookupPatient',
          },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results).toBeDefined();
      expect(result.results[0].result).toContain('VALIDATION ERROR');
    });
  });

  describe('handleWebhook - tool dispatch aliases', () => {
    const makePayload = (name: string, params: Record<string, any> = {}) => ({
      message: {
        type: 'function-call',
        call: { id: `call-alias-${name}`, phoneNumberId: 'pn-1' },
        functionCall: { id: 'tc-1', name, parameters: params },
        assistant: { metadata: { accountId: 'acc-1' } },
      },
    });

    it('should dispatch addNote', async () => {
      await controller.handleWebhook(makePayload('addNote', { patientId: 'p-1', content: 'note' }), '', '');
      expect(agentToolsService.addPatientNote).toHaveBeenCalled();
    });

    it('should dispatch getInsurance', async () => {
      await controller.handleWebhook(makePayload('getInsurance', { patientId: 'p-1' }), '', '');
      expect(agentToolsService.getPatientInsurance).toHaveBeenCalled();
    });

    it('should dispatch getBalance', async () => {
      await controller.handleWebhook(makePayload('getBalance', { patientId: 'p-1' }), '', '');
      expect(agentToolsService.getPatientBalance).toHaveBeenCalled();
    });

    it('should dispatch saveInsurance', async () => {
      await controller.handleWebhook(makePayload('saveInsurance', { patientId: 'p-1', insuranceProvider: 'Ins', memberId: 'm1' }), '', '');
      expect(agentToolsService.saveInsurance).toHaveBeenCalled();
    });

    it('should dispatch searchPatients (alias for lookupPatient)', async () => {
      await controller.handleWebhook(makePayload('searchPatients', { query: 'John' }), '', '');
      expect(agentToolsService.lookupPatient).toHaveBeenCalled();
    });

    it('should dispatch getPatientInfo (alias for lookupPatient)', async () => {
      await controller.handleWebhook(makePayload('getPatientInfo', { query: 'John' }), '', '');
      expect(agentToolsService.lookupPatient).toHaveBeenCalled();
    });

    it('should dispatch addPatientNote (alias for addNote)', async () => {
      await controller.handleWebhook(makePayload('addPatientNote', { patientId: 'p-1', content: 'note' }), '', '');
      expect(agentToolsService.addPatientNote).toHaveBeenCalled();
    });

    it('should dispatch getPatientInsurance', async () => {
      await controller.handleWebhook(makePayload('getPatientInsurance', { patientId: 'p-1' }), '', '');
      expect(agentToolsService.getPatientInsurance).toHaveBeenCalled();
    });

    it('should dispatch getPatientBalance', async () => {
      await controller.handleWebhook(makePayload('getPatientBalance', { patientId: 'p-1' }), '', '');
      expect(agentToolsService.getPatientBalance).toHaveBeenCalled();
    });

    it('should dispatch addPatientInsurance (alias for saveInsurance)', async () => {
      await controller.handleWebhook(makePayload('addPatientInsurance', { patientId: 'p-1', insuranceProvider: 'Ins', memberId: 'm1' }), '', '');
      expect(agentToolsService.saveInsurance).toHaveBeenCalled();
    });

    it('should dispatch updatePatientInsurance (alias for saveInsurance)', async () => {
      await controller.handleWebhook(makePayload('updatePatientInsurance', { patientId: 'p-1', insuranceProvider: 'Ins', memberId: 'm1' }), '', '');
      expect(agentToolsService.saveInsurance).toHaveBeenCalled();
    });

    it('should dispatch rescheduleAppointment', async () => {
      await controller.handleWebhook(makePayload('rescheduleAppointment', { appointmentId: 'a-1', newStartTime: futureDateTime() }), '', '');
      expect(agentToolsService.rescheduleAppointment).toHaveBeenCalled();
    });

    it('should dispatch cancelAppointment', async () => {
      await controller.handleWebhook(makePayload('cancelAppointment', { appointmentId: 'a-1' }), '', '');
      expect(agentToolsService.cancelAppointment).toHaveBeenCalled();
    });

    it('should dispatch getAppointments', async () => {
      await controller.handleWebhook(makePayload('getAppointments', { patientId: 'p-1' }), '', '');
      expect(agentToolsService.getAppointments).toHaveBeenCalled();
    });

    it('should dispatch verifyInsuranceCoverage', async () => {
      await controller.handleWebhook(makePayload('verifyInsuranceCoverage', {}), '', '');
      expect(agentToolsService.verifyInsuranceCoverage).toHaveBeenCalled();
    });

    it('should dispatch getPaymentHistory', async () => {
      await controller.handleWebhook(makePayload('getPaymentHistory', {}), '', '');
      expect(agentToolsService.getPaymentHistory).toHaveBeenCalled();
    });

    it('should dispatch processPayment', async () => {
      await controller.handleWebhook(makePayload('processPayment', { patientId: 'p-1', amount: 100 }), '', '');
      expect(agentToolsService.processPayment).toHaveBeenCalled();
    });

    it('should dispatch createPaymentPlan', async () => {
      await controller.handleWebhook(makePayload('createPaymentPlan', {}), '', '');
      expect(agentToolsService.createPaymentPlan).toHaveBeenCalled();
    });

    it('should dispatch getProviders', async () => {
      await controller.handleWebhook(makePayload('getProviders', {}), '', '');
      expect(agentToolsService.getProviders).toHaveBeenCalled();
    });

    it('should dispatch transferToHuman', async () => {
      await controller.handleWebhook(makePayload('transferToHuman', {}), '', '');
      expect(agentToolsService.transferToHuman).toHaveBeenCalled();
    });

    it('should dispatch takeMessage', async () => {
      await controller.handleWebhook(makePayload('takeMessage', {}), '', '');
      expect(agentToolsService.takeMessage).toHaveBeenCalled();
    });

    it('should dispatch createPatient', async () => {
      await controller.handleWebhook(makePayload('createPatient', { firstName: 'John', lastName: 'Doe', phone: '5551234567', email: 'j@d.com' }), '', '');
      expect(agentToolsService.createPatient).toHaveBeenCalled();
    });

    it('should dispatch updatePatient', async () => {
      await controller.handleWebhook(makePayload('updatePatient', { patientId: 'p-1' }), '', '');
      expect(agentToolsService.updatePatient).toHaveBeenCalled();
    });

    it('should dispatch getCallerContext', async () => {
      agentToolsService.handleGetCallerContext = jest.fn().mockResolvedValue({ result: { success: true } });
      await controller.handleWebhook(makePayload('getCallerContext', {}), '', '');
      expect(agentToolsService.handleGetCallerContext).toHaveBeenCalled();
    });
  });

  describe('handleWebhook - tool error handling', () => {
    it('should handle tool returning error object', async () => {
      agentToolsService.lookupPatient.mockResolvedValue({ error: 'Patient not found' });
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-err', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results[0].result).toContain('[ERROR]');
      expect(result.results[0].result).toContain('Patient not found');
    });

    it('should handle tool returning non-string error object', async () => {
      agentToolsService.lookupPatient.mockResolvedValue({ error: { code: 'NOT_FOUND' } });
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-err2', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results[0].result).toContain('[ERROR]');
    });

    it('should handle tool handler throwing an exception', async () => {
      agentToolsService.lookupPatient.mockRejectedValue(new Error('Database timeout'));
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-throw', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results[0].result).toContain('[ERROR]');
      expect(result.results[0].result).toContain('Database timeout');
    });

    it('should handle tool handler throwing a non-Error', async () => {
      agentToolsService.lookupPatient.mockRejectedValue('string error');
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-throw2', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results[0].result).toContain('[ERROR]');
      expect(result.results[0].result).toContain('Tool execution failed');
    });

    it('should handle tool returning string result', async () => {
      agentToolsService.lookupPatient.mockResolvedValue('plain string result');
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-str', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results[0].result).toContain('[SUCCESS]');
      expect(result.results[0].result).toContain('plain string result');
    });
  });

  describe('handleWebhook - rate limiting', () => {
    it('should block a tool after RATE_LIMIT_PER_TOOL calls', async () => {
      const makePayload = () => ({
        message: {
          type: 'function-call',
          call: { id: 'call-rl', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      });

      for (let i = 0; i < 5; i++) {
        await controller.handleWebhook(makePayload(), '', '');
      }
      const result = (await controller.handleWebhook(makePayload(), '', '')) as any;
      expect(result.results[0].result).toContain('[ERROR]');
      expect(result.results[0].result).toContain('already called');
    });

    it('should not rate limit when callId is missing', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: {},
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      for (let i = 0; i < 10; i++) {
        const result = (await controller.handleWebhook(payload, '', '')) as any;
        expect(result.results[0].result).toContain('[SUCCESS]');
      }
    });
  });

  describe('handleWebhook - booking fallback', () => {
    it('should trigger fallback after BOOKING_FALLBACK_THRESHOLD errors on booking tools', async () => {
      agentToolsService.bookAppointment.mockResolvedValue({ error: 'Slot taken' });
      const makePayload = () => ({
        message: {
          type: 'function-call',
          call: { id: 'call-bf', phoneNumberId: 'pn-1' },
          functionCall: {
            id: 'tc-1',
            name: 'bookAppointment',
            parameters: { patientId: 'p-1', startTime: futureDateTime(), email: 'a@b.com' },
          },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      });

      let result: any;
      for (let i = 0; i < 3; i++) {
        result = await controller.handleWebhook(makePayload(), '', '');
      }
      expect(result.results[0].result).toContain('[FALLBACK]');
      expect(result.results[0].result).toContain('transferCall');
    });

    it('should not trigger fallback for non-booking tools', async () => {
      agentToolsService.getProviders.mockResolvedValue({ error: 'Failed' });
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-nbf', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'getProviders', parameters: {} },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      for (let i = 0; i < 5; i++) {
        const result = (await controller.handleWebhook(payload, '', '')) as any;
        expect(result.results[0].result).not.toContain('[FALLBACK]');
      }
    });
  });

  describe('handleWebhook - validation branches', () => {
    const makeValidationPayload = (name: string, params: Record<string, any>) => ({
      message: {
        type: 'function-call',
        call: { id: `call-val-${name}-${Date.now()}`, phoneNumberId: 'pn-1' },
        functionCall: { id: 'tc-1', name, parameters: params },
        assistant: { metadata: { accountId: 'acc-1' } },
      },
    });

    it('should reject addNote without patientId', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('addNote', { content: 'note' }), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Patient ID is required');
    });

    it('should reject addNote without content', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('addNote', { patientId: 'p-1' }), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Note content is required');
    });

    it('should reject addPatientNote without patientId', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('addPatientNote', { content: 'note' }), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
    });

    it('should reject getInsurance without patientId', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('getInsurance', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Patient ID is required');
    });

    it('should reject getPatientInsurance without patientId', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('getPatientInsurance', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
    });

    it('should reject getBalance without patientId', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('getBalance', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
    });

    it('should reject getPatientBalance without patientId', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('getPatientBalance', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
    });

    it('should reject saveInsurance without required fields', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('saveInsurance', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Patient ID is required');
      expect(result.results[0].result).toContain('Insurance provider name is required');
      expect(result.results[0].result).toContain('Member ID is required');
    });

    it('should reject addPatientInsurance without required fields', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('addPatientInsurance', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
    });

    it('should reject updatePatientInsurance without required fields', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('updatePatientInsurance', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
    });

    it('should reject rescheduleAppointment without appointmentId', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('rescheduleAppointment', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Appointment ID is required');
    });

    it('should reject rescheduleAppointment without newStartTime', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('rescheduleAppointment', { appointmentId: 'a-1' }), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('New start time is required');
    });

    it('should reject cancelAppointment without appointmentId', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('cancelAppointment', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Appointment ID is required');
    });

    it('should reject getAppointments without patient filter', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('getAppointments', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Patient identification is required');
    });

    it('should reject updatePatient without patientId', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('updatePatient', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Patient ID is required');
    });

    it('should reject processPayment without patientId', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('processPayment', { amount: 100 }), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Patient ID is required');
    });

    it('should reject processPayment without amount', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('processPayment', { patientId: 'p-1' }), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Payment amount is required');
    });

    it('should reject checkAvailability without date', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('checkAvailability', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Date is required');
    });

    it('should reject checkAvailability with past date', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('checkAvailability', { date: '2020-01-01' }), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('in the past');
    });

    it('should reject lookupPatient with no search criteria', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('lookupPatient', {}), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('search query is required');
    });

    it('should reject bookAppointment without startTime', async () => {
      const result = (await controller.handleWebhook(makeValidationPayload('bookAppointment', { patientId: 'p-1', email: 'a@b.com' }), '', '')) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Start time is required');
    });

    it('should warn but allow bookAppointment with patientId but no email', async () => {
      const result = (await controller.handleWebhook(
        makeValidationPayload('bookAppointment', { patientId: 'p-1', startTime: futureDateTime() }),
        '', '',
      )) as any;
      expect(agentToolsService.bookAppointment).toHaveBeenCalled();
    });

    it('should reject bookAppointment without patientId and missing email+name', async () => {
      const result = (await controller.handleWebhook(
        makeValidationPayload('bookAppointment', { startTime: futureDateTime() }),
        '', '',
      )) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Email address is required');
      expect(result.results[0].result).toContain('Patient name is required');
    });

    it('should reject createPatient with short phone', async () => {
      const result = (await controller.handleWebhook(
        makeValidationPayload('createPatient', { firstName: 'A', lastName: 'B', phone: '123', email: 'a@b.com' }),
        '', '',
      )) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('real phone number');
    });

    it('should reject createPatient without email', async () => {
      const result = (await controller.handleWebhook(
        makeValidationPayload('createPatient', { firstName: 'A', lastName: 'B', phone: '5551234567' }),
        '', '',
      )) as any;
      expect(result.results[0].result).toContain('VALIDATION ERROR');
      expect(result.results[0].result).toContain('Email address is required');
    });
  });

  describe('handleWebhook - template variable resolution', () => {
    it('should resolve {{call.customer.number}} in parameters', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: {
            id: 'call-tmpl',
            phoneNumberId: 'pn-1',
            customer: { number: '+15551234567' },
          },
          functionCall: {
            id: 'tc-1',
            name: 'lookupPatient',
            parameters: { phone: '{{call.customer.number}}' },
          },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results).toBeDefined();
      expect(agentToolsService.lookupPatient).toHaveBeenCalledWith(
        expect.objectContaining({
          functionCall: expect.objectContaining({
            parameters: expect.objectContaining({ phone: '+15551234567' }),
          }),
        }),
      );
    });

    it('should replace placeholder phone text with actual number', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: {
            id: 'call-tmpl2',
            phoneNumberId: 'pn-1',
            customer: { number: '+15559876543' },
          },
          functionCall: {
            id: 'tc-1',
            name: 'lookupPatient',
            parameters: { phone: 'caller_phone_number' },
          },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(agentToolsService.lookupPatient).toHaveBeenCalledWith(
        expect.objectContaining({
          functionCall: expect.objectContaining({
            parameters: expect.objectContaining({ phone: '+15559876543' }),
          }),
        }),
      );
    });

    it('should handle resolveTemplateVars with null params', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-tmpl3', phoneNumberId: 'pn-1' },
          functionCall: {
            id: 'tc-1',
            name: 'lookupPatient',
            parameters: { query: 'test' },
          },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results).toBeDefined();
    });

    it('should resolve template vars in nested arrays', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: {
            id: 'call-tmpl-arr',
            phoneNumberId: 'pn-1',
            customer: { number: '+15551112222' },
          },
          functionCall: {
            id: 'tc-1',
            name: 'lookupPatient',
            parameters: { phones: ['{{call.customer.number}}'], query: 'test' },
          },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(agentToolsService.lookupPatient).toHaveBeenCalled();
    });

    it('should pass through non-string/non-array/non-object values unchanged', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: {
            id: 'call-tmpl-num',
            phoneNumberId: 'pn-1',
            customer: { number: '+15551112222' },
          },
          functionCall: {
            id: 'tc-1',
            name: 'lookupPatient',
            parameters: { query: 'test', count: 5, active: true },
          },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(agentToolsService.lookupPatient).toHaveBeenCalledWith(
        expect.objectContaining({
          functionCall: expect.objectContaining({
            parameters: expect.objectContaining({ count: 5, active: true }),
          }),
        }),
      );
    });
  });

  describe('handleWebhook - status-update with prefetch', () => {
    it('should prefetch caller context when in-progress with caller phone and account', async () => {
      agentToolsService.prefetchCallerContext = jest.fn().mockResolvedValue(undefined);
      prisma.callReference.upsert.mockResolvedValue({});

      const result = await controller.handleWebhook({
        message: {
          type: 'status-update',
          status: 'in-progress',
          call: { id: 'call-pf', phoneNumberId: 'pn-1', customer: { number: '+15551234567' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      }, '', '');
      expect(result).toEqual({ received: true });
      expect(agentToolsService.prefetchCallerContext).toHaveBeenCalledWith(
        'call-pf', '+15551234567', 'acc-1', 'VAPI',
      );
    });

    it('should handle prefetch failure gracefully', async () => {
      agentToolsService.prefetchCallerContext = jest.fn().mockRejectedValue(new Error('prefetch failed'));
      prisma.callReference.upsert.mockResolvedValue({});

      const result = await controller.handleWebhook({
        message: {
          type: 'status-update',
          status: 'in-progress',
          call: { id: 'call-pf2', phoneNumberId: 'pn-1', customer: { number: '+15551234567' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      }, '', '');
      expect(result).toEqual({ received: true });
    });

    it('should skip prefetch when no caller phone', async () => {
      agentToolsService.prefetchCallerContext = jest.fn();
      prisma.callReference.upsert.mockResolvedValue({});

      const result = await controller.handleWebhook({
        message: {
          type: 'status-update',
          status: 'in-progress',
          call: { id: 'call-pf3', phoneNumberId: 'pn-1' },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      }, '', '');
      expect(result).toEqual({ received: true });
      expect(agentToolsService.prefetchCallerContext).not.toHaveBeenCalled();
    });

    it('should skip prefetch when no account resolved', async () => {
      agentToolsService.prefetchCallerContext = jest.fn();
      prisma.callReference.upsert.mockResolvedValue({});
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.account.findMany.mockResolvedValue([]);

      const result = await controller.handleWebhook({
        message: {
          type: 'status-update',
          status: 'in-progress',
          call: { id: 'call-pf4', customer: { number: '+15551234567' } },
        },
      }, '', '');
      expect(result).toEqual({ received: true });
      expect(agentToolsService.prefetchCallerContext).not.toHaveBeenCalled();
    });

    it('should skip call reference for non-in-progress status', async () => {
      prisma.callReference.upsert.mockResolvedValue({});
      const result = await controller.handleWebhook({
        message: {
          type: 'status-update',
          status: 'ringing',
          call: { id: 'call-ring' },
        },
      }, '', '');
      expect(result).toEqual({ received: true });
      expect(prisma.callReference.upsert).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook - ensureCallReference', () => {
    it('should handle db error when upserting call reference', async () => {
      prisma.callReference.upsert.mockRejectedValue(new Error('DB write error'));
      const result = await controller.handleWebhook({
        message: {
          type: 'end-of-call-report',
          call: { id: 'call-dbfail' },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      }, '', '');
      expect(result).toEqual({ received: true });
    });

    it('should skip call reference when no callId', async () => {
      const result = await controller.handleWebhook({
        message: { type: 'end-of-call-report', call: {} },
      }, '', '');
      expect(result).toEqual({ received: true });
      expect(prisma.callReference.upsert).not.toHaveBeenCalled();
    });

    it('should skip call reference when no account resolved', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.account.findMany.mockResolvedValue([]);
      const result = await controller.handleWebhook({
        message: {
          type: 'end-of-call-report',
          call: { id: 'call-noacct' },
        },
      }, '', '');
      expect(result).toEqual({ received: true });
      expect(prisma.callReference.upsert).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook - resolveAccountFromCall', () => {
    it('should resolve via vapiPhoneNumber by phone ID', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValueOnce({ accountId: 'acc-phone' });
      prisma.callReference.upsert.mockResolvedValue({});

      const result = await controller.handleWebhook({
        message: {
          type: 'end-of-call-report',
          call: { id: 'call-res1', phoneNumberId: 'pn-x' },
        },
      }, '', '');
      expect(result).toEqual({ received: true });
      expect(prisma.callReference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ accountId: 'acc-phone' }),
        }),
      );
    });

    it('should resolve via vapiPhoneNumber by phone string', async () => {
      prisma.vapiPhoneNumber.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ accountId: 'acc-numstr' });
      prisma.callReference.upsert.mockResolvedValue({});

      const result = await controller.handleWebhook({
        message: {
          type: 'end-of-call-report',
          call: { id: 'call-res2', phoneNumberId: 'pn-miss', phoneNumber: { number: '+15551234567' } },
        },
      }, '', '');
      expect(result).toEqual({ received: true });
      expect(prisma.callReference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ accountId: 'acc-numstr' }),
        }),
      );
    });

    it('should resolve via phoneIntegrationSettings fallback', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.account.findMany.mockResolvedValue([
        { id: 'acc-settings', phoneIntegrationSettings: { vapiPhoneId: 'pn-fallback' } },
        { id: 'acc-other', phoneIntegrationSettings: { vapiPhoneId: 'pn-other' } },
      ]);
      prisma.callReference.upsert.mockResolvedValue({});

      const result = await controller.handleWebhook({
        message: {
          type: 'end-of-call-report',
          call: { id: 'call-res3', phoneNumberId: 'pn-fallback' },
        },
      }, '', '');
      expect(result).toEqual({ received: true });
      expect(prisma.callReference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ accountId: 'acc-settings' }),
        }),
      );
    });

    it('should handle error in resolveAccountFromCall', async () => {
      prisma.vapiPhoneNumber.findFirst.mockRejectedValue(new Error('DB error'));

      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-res-err', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
        },
      };
      const result = (await controller.handleWebhook(payload, '', '')) as any;
      expect(result.results).toBeDefined();
    });
  });

  describe('getRecentCalls', () => {
    it('should return 404 when test endpoints not enabled', () => {
      delete process.env.ENABLE_TEST_ENDPOINTS;
      expect(() => controller.getRecentCalls()).toThrow(HttpException);
    });

    it('should return recent calls within time window', async () => {
      process.env.ENABLE_TEST_ENDPOINTS = 'true';

      agentToolsService.lookupPatient.mockResolvedValue({ patients: [] });
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-recent-1', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      await controller.handleWebhook(payload, '', '');

      const result = controller.getRecentCalls();
      expect(Array.isArray(result)).toBe(true);
      delete process.env.ENABLE_TEST_ENDPOINTS;
    });

    it('should filter by after/before parameters', async () => {
      process.env.ENABLE_TEST_ENDPOINTS = 'true';
      const now = new Date();
      const after = new Date(now.getTime() - 60000).toISOString();
      const before = new Date(now.getTime() + 60000).toISOString();

      agentToolsService.lookupPatient.mockResolvedValue({ patients: [] });
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-recent-2', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      await controller.handleWebhook(payload, '', '');

      const result = controller.getRecentCalls(after, before);
      expect(Array.isArray(result)).toBe(true);
      delete process.env.ENABLE_TEST_ENDPOINTS;
    });

    it('should return empty when no calls in window', () => {
      process.env.ENABLE_TEST_ENDPOINTS = 'true';
      const result = controller.getRecentCalls(
        '2020-01-01T00:00:00Z',
        '2020-01-02T00:00:00Z',
      );
      expect(result).toEqual([]);
      delete process.env.ENABLE_TEST_ENDPOINTS;
    });
  });

  describe('recordToolCall', () => {
    it('should record tool calls when ENABLE_TEST_ENDPOINTS is set', async () => {
      process.env.ENABLE_TEST_ENDPOINTS = 'true';
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-rec-1', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      await controller.handleWebhook(payload, '', '');

      const history = controller.getToolCallHistory('call-rec-1');
      expect(history.toolCalls.length).toBeGreaterThanOrEqual(1);
      expect(history.toolCalls[0].toolName).toBe('lookupPatient');
      expect(history.toolCalls[0].success).toBe(true);
      delete process.env.ENABLE_TEST_ENDPOINTS;
    });

    it('should record failed tool calls', async () => {
      process.env.ENABLE_TEST_ENDPOINTS = 'true';
      agentToolsService.lookupPatient.mockRejectedValue(new Error('fail'));
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-rec-fail', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'lookupPatient', parameters: { query: 'John' } },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      await controller.handleWebhook(payload, '', '');

      const history = controller.getToolCallHistory('call-rec-fail');
      expect(history.toolCalls.length).toBeGreaterThanOrEqual(1);
      expect(history.toolCalls[0].success).toBe(false);
      delete process.env.ENABLE_TEST_ENDPOINTS;
    });

    it('should record validation failures', async () => {
      process.env.ENABLE_TEST_ENDPOINTS = 'true';
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-rec-val', phoneNumberId: 'pn-1' },
          functionCall: { id: 'tc-1', name: 'bookAppointment', parameters: {} },
          assistant: { metadata: { accountId: 'acc-1' } },
        },
      };
      await controller.handleWebhook(payload, '', '');

      const history = controller.getToolCallHistory('call-rec-val');
      expect(history.toolCalls.length).toBeGreaterThanOrEqual(1);
      expect(history.toolCalls[0].success).toBe(false);
      delete process.env.ENABLE_TEST_ENDPOINTS;
    });
  });

  describe('handleWebhook - known silent/noop types', () => {
    for (const type of ['conversation-update', 'hang', 'transfer-destination-request', 'voice-input', 'user-interrupted', 'assistant.started']) {
      it(`should acknowledge ${type}`, async () => {
        const result = await controller.handleWebhook(
          { message: { type } },
          '', '',
        );
        expect(result).toEqual({ received: true });
      });
    }
  });
});
