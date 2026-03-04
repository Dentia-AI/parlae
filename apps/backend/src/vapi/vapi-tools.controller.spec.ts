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
    takeMessage: jest.fn().mockResolvedValue({ result: { success: true } }),
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

    it('should route getPatientInfo', async () => {
      await controller.handleToolCall('getPatientInfo', { id: 'p-1' }, 'test-vapi-secret', '');
      expect(agentToolsService.getPatientInfo).toHaveBeenCalledWith({ id: 'p-1' });
    });

    it('should route get-patient-info', async () => {
      await controller.handleToolCall('get-patient-info', { id: 'p-1' }, 'test-vapi-secret', '');
      expect(agentToolsService.getPatientInfo).toHaveBeenCalled();
    });

    it('should route createPatient', async () => {
      await controller.handleToolCall('createPatient', { name: 'New' }, 'test-vapi-secret', '');
      expect(agentToolsService.createPatient).toHaveBeenCalledWith({ name: 'New' });
    });

    it('should route create-patient', async () => {
      await controller.handleToolCall('create-patient', {}, 'test-vapi-secret', '');
      expect(agentToolsService.createPatient).toHaveBeenCalled();
    });

    it('should route updatePatient', async () => {
      await controller.handleToolCall('updatePatient', { id: 'p-1' }, 'test-vapi-secret', '');
      expect(agentToolsService.updatePatient).toHaveBeenCalled();
    });

    it('should route update-patient', async () => {
      await controller.handleToolCall('update-patient', {}, 'test-vapi-secret', '');
      expect(agentToolsService.updatePatient).toHaveBeenCalled();
    });

    it('should route check-availability', async () => {
      await controller.handleToolCall('check-availability', {}, 'test-vapi-secret', '');
      expect(agentToolsService.checkAvailability).toHaveBeenCalled();
    });

    it('should route rescheduleAppointment', async () => {
      await controller.handleToolCall('rescheduleAppointment', {}, 'test-vapi-secret', '');
      expect(agentToolsService.rescheduleAppointment).toHaveBeenCalled();
    });

    it('should route reschedule-appointment', async () => {
      await controller.handleToolCall('reschedule-appointment', {}, 'test-vapi-secret', '');
      expect(agentToolsService.rescheduleAppointment).toHaveBeenCalled();
    });

    it('should route cancel-appointment', async () => {
      await controller.handleToolCall('cancel-appointment', {}, 'test-vapi-secret', '');
      expect(agentToolsService.cancelAppointment).toHaveBeenCalled();
    });

    it('should route getAppointments', async () => {
      await controller.handleToolCall('getAppointments', {}, 'test-vapi-secret', '');
      expect(agentToolsService.getAppointments).toHaveBeenCalled();
    });

    it('should route get-appointments', async () => {
      await controller.handleToolCall('get-appointments', {}, 'test-vapi-secret', '');
      expect(agentToolsService.getAppointments).toHaveBeenCalled();
    });

    it('should route addPatientNote', async () => {
      await controller.handleToolCall('addPatientNote', { note: 'hi' }, 'test-vapi-secret', '');
      expect(agentToolsService.addPatientNote).toHaveBeenCalledWith({ note: 'hi' });
    });

    it('should route add-patient-note', async () => {
      await controller.handleToolCall('add-patient-note', {}, 'test-vapi-secret', '');
      expect(agentToolsService.addPatientNote).toHaveBeenCalled();
    });

    it('should route getPatientInsurance', async () => {
      await controller.handleToolCall('getPatientInsurance', {}, 'test-vapi-secret', '');
      expect(agentToolsService.getPatientInsurance).toHaveBeenCalled();
    });

    it('should route get-patient-insurance', async () => {
      await controller.handleToolCall('get-patient-insurance', {}, 'test-vapi-secret', '');
      expect(agentToolsService.getPatientInsurance).toHaveBeenCalled();
    });

    it('should route getPatientBalance', async () => {
      await controller.handleToolCall('getPatientBalance', {}, 'test-vapi-secret', '');
      expect(agentToolsService.getPatientBalance).toHaveBeenCalled();
    });

    it('should route get-patient-balance', async () => {
      await controller.handleToolCall('get-patient-balance', {}, 'test-vapi-secret', '');
      expect(agentToolsService.getPatientBalance).toHaveBeenCalled();
    });

    it('should route get-providers', async () => {
      await controller.handleToolCall('get-providers', {}, 'test-vapi-secret', '');
      expect(agentToolsService.getProviders).toHaveBeenCalled();
    });

    it('should route transfer-to-human', async () => {
      await controller.handleToolCall('transfer-to-human', {}, 'test-vapi-secret', '');
      expect(agentToolsService.transferToHuman).toHaveBeenCalled();
    });

    it('should route takeMessage', async () => {
      await controller.handleToolCall('takeMessage', { msg: 'call me' }, 'test-vapi-secret', '');
      expect(agentToolsService.takeMessage).toHaveBeenCalledWith({ msg: 'call me' });
    });

    it('should pass body to handler and return result', async () => {
      const payload = { query: 'Smith', accountId: 'acc-1' };
      agentToolsService.searchPatients.mockResolvedValue({ patients: [{ id: 'p-1' }] });
      const result = await controller.handleToolCall('searchPatients', payload, 'test-vapi-secret', '');
      expect(result).toEqual({ patients: [{ id: 'p-1' }] });
      expect(agentToolsService.searchPatients).toHaveBeenCalledWith(payload);
    });

    it('should throw 404 with descriptive error for unknown tool', async () => {
      try {
        await controller.handleToolCall('nonExistentTool', {}, 'test-vapi-secret', '');
        fail('Expected HttpException');
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(404);
        expect((e as HttpException).getResponse()).toEqual(
          expect.objectContaining({ error: 'Unknown tool: nonExistentTool' }),
        );
      }
    });
  });

  describe('authentication edge cases', () => {
    it('should reject when vapi secret is wrong and no bearer token', async () => {
      await expect(
        controller.handleToolCall('checkAvailability', {}, 'wrong-secret', ''),
      ).rejects.toThrow(HttpException);
    });

    it('should reject when bearer token is wrong and no vapi secret', async () => {
      await expect(
        controller.handleToolCall('checkAvailability', {}, '', 'Bearer wrong-key'),
      ).rejects.toThrow(HttpException);
    });

    it('should reject when both auth methods fail', async () => {
      await expect(
        controller.handleToolCall('checkAvailability', {}, 'wrong', 'Bearer wrong'),
      ).rejects.toThrow(HttpException);
    });

    it('should work without BACKEND_API_KEY env var if vapi secret matches', async () => {
      delete process.env.BACKEND_API_KEY;
      const result = await controller.handleToolCall(
        'checkAvailability', {}, 'test-vapi-secret', '',
      );
      expect(result).toEqual({ slots: [] });
    });

    it('should work without VAPI_WEBHOOK_SECRET env var if bearer token matches', async () => {
      delete process.env.VAPI_WEBHOOK_SECRET;
      const result = await controller.handleToolCall(
        'checkAvailability', {}, '', 'Bearer test-api-key',
      );
      expect(result).toEqual({ slots: [] });
    });
  });
});
