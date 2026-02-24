import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { VapiWebhookController } from './vapi-webhook.controller';
import { VapiToolsService } from './vapi-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';

describe('VapiWebhookController', () => {
  let controller: VapiWebhookController;
  let vapiToolsService: any;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const mockVapiTools = {
      lookupPatient: jest.fn().mockResolvedValue({ result: { success: true } }),
      createPatient: jest.fn().mockResolvedValue({ result: { success: true } }),
      bookAppointment: jest.fn().mockResolvedValue({ result: { success: true } }),
      checkAvailability: jest.fn().mockResolvedValue({ result: { success: true } }),
      cancelAppointment: jest.fn().mockResolvedValue({ result: { success: true } }),
      rescheduleAppointment: jest.fn().mockResolvedValue({ result: { success: true } }),
      getAppointments: jest.fn().mockResolvedValue({ result: { success: true } }),
      transferToHuman: jest.fn().mockResolvedValue({ result: { success: true } }),
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
        { provide: VapiToolsService, useValue: mockVapiTools },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<VapiWebhookController>(VapiWebhookController);
    vapiToolsService = module.get(VapiToolsService);
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
          functionCall: { name: 'checkAvailability', parameters: { date: '2026-03-01' } },
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
      expect(vapiToolsService.lookupPatient).toHaveBeenCalled();
    });

    it('should dispatch bookAppointment', async () => {
      const result = await controller.handleWebhook(
        makeFunctionPayload('bookAppointment', { patientId: 'p-1', startTime: '2026-03-01T10:00:00Z', email: 'a@b.com' }),
        '',
        '',
      );
      expect(vapiToolsService.bookAppointment).toHaveBeenCalled();
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
      expect(vapiToolsService.bookAppointment).not.toHaveBeenCalled();
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
});
