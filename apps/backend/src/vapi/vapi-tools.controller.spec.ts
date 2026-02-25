import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { VapiToolsController } from './vapi-tools.controller';
import { AgentToolsService } from '../agent-tools/agent-tools.service';

describe('VapiToolsController', () => {
  let controller: VapiToolsController;
  let agentToolsService: any;

  const mockAgentToolsService = {
    searchPatients: jest.fn().mockResolvedValue({ patients: [] }),
    getPatientInfo: jest.fn().mockResolvedValue({ patient: null }),
    createPatient: jest.fn().mockResolvedValue({ success: true }),
    updatePatient: jest.fn().mockResolvedValue({ success: true }),
    checkAvailability: jest.fn().mockResolvedValue({ slots: [] }),
    bookAppointment: jest.fn().mockResolvedValue({ success: true }),
    rescheduleAppointment: jest.fn().mockResolvedValue({ success: true }),
    cancelAppointment: jest.fn().mockResolvedValue({ success: true }),
    getAppointments: jest.fn().mockResolvedValue({ appointments: [] }),
    addPatientNote: jest.fn().mockResolvedValue({ success: true }),
    getPatientInsurance: jest.fn().mockResolvedValue({ insurance: null }),
    getPatientBalance: jest.fn().mockResolvedValue({ balance: 0 }),
    getProviders: jest.fn().mockResolvedValue({ providers: [] }),
    transferToHuman: jest.fn().mockResolvedValue({ transferred: true }),
    lookupPatient: jest.fn().mockResolvedValue({ patient: null }),
  };

  beforeEach(async () => {
    process.env.VAPI_WEBHOOK_SECRET = 'test-vapi-secret';
    process.env.BACKEND_API_KEY = 'test-api-key';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VapiToolsController],
      providers: [
        { provide: AgentToolsService, useValue: mockAgentToolsService },
      ],
    }).compile();

    controller = module.get<VapiToolsController>(VapiToolsController);
    agentToolsService = module.get(AgentToolsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.VAPI_WEBHOOK_SECRET;
    delete process.env.BACKEND_API_KEY;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('authentication', () => {
    it('should accept valid x-vapi-secret', async () => {
      const result = await controller.handleToolCall(
        'checkAvailability',
        { date: '2026-03-01' },
        'test-vapi-secret',
        '',
      );
      expect(result).toEqual({ slots: [] });
    });

    it('should accept valid Bearer token', async () => {
      const result = await controller.handleToolCall(
        'checkAvailability',
        { date: '2026-03-01' },
        '',
        'Bearer test-api-key',
      );
      expect(result).toEqual({ slots: [] });
    });

    it('should reject invalid authentication', async () => {
      await expect(
        controller.handleToolCall('checkAvailability', {}, 'wrong', ''),
      ).rejects.toThrow(HttpException);
    });

    it('should reject when no auth provided', async () => {
      await expect(
        controller.handleToolCall('checkAvailability', {}, '', ''),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('tool routing', () => {
    it('should route camelCase tool names', async () => {
      await controller.handleToolCall('searchPatients', { query: 'John' }, 'test-vapi-secret', '');
      expect(agentToolsService.searchPatients).toHaveBeenCalled();
    });

    it('should route kebab-case tool names', async () => {
      await controller.handleToolCall('search-patients', { query: 'John' }, 'test-vapi-secret', '');
      expect(agentToolsService.searchPatients).toHaveBeenCalled();
    });

    it('should route bookAppointment', async () => {
      await controller.handleToolCall('bookAppointment', {}, 'test-vapi-secret', '');
      expect(agentToolsService.bookAppointment).toHaveBeenCalled();
    });

    it('should route book-appointment', async () => {
      await controller.handleToolCall('book-appointment', {}, 'test-vapi-secret', '');
      expect(agentToolsService.bookAppointment).toHaveBeenCalled();
    });

    it('should route cancelAppointment', async () => {
      await controller.handleToolCall('cancelAppointment', {}, 'test-vapi-secret', '');
      expect(agentToolsService.cancelAppointment).toHaveBeenCalled();
    });

    it('should route getProviders', async () => {
      await controller.handleToolCall('getProviders', {}, 'test-vapi-secret', '');
      expect(agentToolsService.getProviders).toHaveBeenCalled();
    });

    it('should route transferToHuman', async () => {
      await controller.handleToolCall('transferToHuman', {}, 'test-vapi-secret', '');
      expect(agentToolsService.transferToHuman).toHaveBeenCalled();
    });

    it('should throw 404 for unknown tool', async () => {
      await expect(
        controller.handleToolCall('unknownTool', {}, 'test-vapi-secret', ''),
      ).rejects.toThrow(HttpException);
    });
  });
});
