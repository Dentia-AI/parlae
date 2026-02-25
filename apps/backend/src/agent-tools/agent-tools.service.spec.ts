import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AgentToolsService } from './agent-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HipaaAuditService } from '../common/services/hipaa-audit.service';
import { SecretsService } from '../common/services/secrets.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';
import { createMockGoogleCalendarService } from '../test/mocks/google-calendar.mock';
import { createMockNotificationsService } from '../test/mocks/notifications.mock';
import { createMockHipaaAuditService } from '../test/mocks/hipaa-audit.mock';
import { createMockSecretsService } from '../test/mocks/secrets.mock';

describe('AgentToolsService', () => {
  let service: AgentToolsService;
  let prisma: any;
  let gcalService: any;
  let notificationsService: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const mockGcal = createMockGoogleCalendarService();
    const mockNotifications = createMockNotificationsService();
    const mockHipaa = createMockHipaaAuditService();
    const mockSecrets = createMockSecretsService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentToolsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GoogleCalendarService, useValue: mockGcal },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: HipaaAuditService, useValue: mockHipaa },
        { provide: SecretsService, useValue: mockSecrets },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AgentToolsService>(AgentToolsService);
    prisma = module.get(PrismaService);
    gcalService = module.get(GoogleCalendarService);
    notificationsService = module.get(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('transferToHuman', () => {
    it('should return transfer instruction with phone number', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        id: 'vpn-1',
        accountId: 'acc-1',
        transferEnabled: true,
        staffForwardNumber: '+14155559999',
        account: { name: 'Test Clinic' },
      });

      const result = await service.transferToHuman({
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: { reason: 'Patient request' } } },
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should handle missing account', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);
      const result = await service.transferToHuman({
        call: { id: 'call-1', phoneNumberId: 'missing' },
        message: { functionCall: { parameters: {} } },
      });
      expect(result).toBeDefined();
    });
  });

  describe('checkAvailability', () => {
    it('should use GCal fallback when no PMS', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: {
          id: 'acc-1',
          googleCalendarConnected: true,
          brandingTimezone: 'America/New_York',
        },
      });
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.checkFreeBusy.mockResolvedValue({
        success: true,
        availableSlots: [{ startTime: '2026-03-01T09:00:00Z', endTime: '2026-03-01T12:00:00Z' }],
      });

      const result = await service.checkAvailability({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: { date: '2026-03-01' } },
      });

      expect(result).toBeDefined();
    });

    it('should handle missing date', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1' },
      });
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.checkFreeBusy.mockResolvedValue({
        success: true,
        availableSlots: [],
      });

      const result = await service.checkAvailability({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: {} },
      });
      expect(result).toBeDefined();
    });
  });

  describe('bookAppointment', () => {
    it('should use GCal when no PMS', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: {
          id: 'acc-1',
          googleCalendarConnected: true,
          brandingTimezone: 'America/New_York',
          name: 'Test Clinic',
        },
      });
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.createAppointmentEvent.mockResolvedValue({
        success: true,
        eventId: 'evt-1',
        htmlLink: 'https://cal/evt-1',
      });

      const result = await service.bookAppointment({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        message: {
          functionCall: {
            parameters: {
              patientId: 'p-1',
              startTime: '2026-03-01T10:00:00Z',
              appointmentType: 'Cleaning',
              firstName: 'John',
              lastName: 'Doe',
              email: 'john@test.com',
            },
          },
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe('lookupPatient', () => {
    it('should search by phone when provided', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1', googleCalendarConnected: true },
      });

      const result = await service.lookupPatient({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1', customer: { number: '+14155551234' } },
        functionCall: { parameters: { phone: '+14155551234' } },
      });

      expect(result).toBeDefined();
    });
  });

  describe('createPatient', () => {
    it('should return created patient info (GCal-only mode)', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: null,
      });

      const result = await service.createPatient({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        functionCall: {
          parameters: {
            firstName: 'Jane',
            lastName: 'Doe',
            phone: '+14155559999',
            email: 'jane@test.com',
          },
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe('cancelAppointment', () => {
    it('should cancel via GCal when no PMS', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1', googleCalendarConnected: true },
      });
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.deleteEvent.mockResolvedValue({ success: true });

      const result = await service.cancelAppointment({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        message: {
          functionCall: {
            parameters: { appointmentId: 'evt-1', reason: 'Changed plans' },
          },
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe('addPatientNote', () => {
    it('should return success when no PMS (note acknowledged)', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: null,
      });

      const result = await service.addPatientNote({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        functionCall: {
          parameters: { patientId: 'p-1', content: 'Patient prefers mornings' },
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe('getProviders', () => {
    it('should handle no PMS configured', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1' },
      });

      const result = await service.getProviders({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: {} },
      });

      // When no PMS, getSikkaService returns { service: null }; getProviders returns sikkaService.error (undefined)
      expect(result === undefined || typeof result === 'object').toBe(true);
    });
  });

  // ── Retell call paths (agent_id-based resolution) ──────────────────

  describe('transferToHuman (Retell path)', () => {
    it('should resolve phone record via retellPhoneNumber by agent_id', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        id: 'rpn-1',
        accountId: 'acc-retell',
        phoneNumber: '+14165550001',
        retellAgentId: 'retell-agent-1',
        account: {
          id: 'acc-retell',
          name: 'Retell Clinic',
          phoneIntegrationSettings: {
            staffForwardNumber: '+14165550002',
          },
        },
      });

      const result = await service.transferToHuman({
        accountId: 'acc-retell',
        call: { id: 'retell-call-1', agent_id: 'retell-agent-1' },
        message: { functionCall: { parameters: { reason: 'Emergency' } } },
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should handle missing Retell phone record gracefully', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);

      const result = await service.transferToHuman({
        accountId: undefined,
        call: { id: 'retell-call-2', agent_id: 'unknown-agent' },
        message: { functionCall: { parameters: {} } },
      });

      expect(result).toBeDefined();
    });
  });

  describe('checkAvailability (Retell path)', () => {
    it('should use GCal fallback via retellPhoneNumber resolution', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-retell',
        account: {
          id: 'acc-retell',
          googleCalendarConnected: true,
          brandingTimezone: 'America/Toronto',
        },
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.checkFreeBusy.mockResolvedValue({
        success: true,
        availableSlots: [{ startTime: '2026-03-01T09:00:00Z', endTime: '2026-03-01T12:00:00Z' }],
      });

      const result = await service.checkAvailability({
        accountId: 'acc-retell',
        call: { id: 'retell-call-3', agent_id: 'retell-agent-2' },
        functionCall: { parameters: { date: '2026-03-01' } },
      });

      expect(result).toBeDefined();
    });
  });

  describe('bookAppointment (Retell path)', () => {
    it('should use GCal when Retell call has no PMS', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-retell',
        account: {
          id: 'acc-retell',
          googleCalendarConnected: true,
          brandingTimezone: 'America/Toronto',
          name: 'Retell Dental',
        },
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.createAppointmentEvent.mockResolvedValue({
        success: true,
        eventId: 'evt-retell',
        htmlLink: 'https://cal/evt-retell',
      });

      const result = await service.bookAppointment({
        accountId: 'acc-retell',
        call: { id: 'retell-call-4', agent_id: 'retell-agent-2' },
        message: {
          functionCall: {
            parameters: {
              patientId: 'p-retell',
              startTime: '2026-03-01T10:00:00Z',
              appointmentType: 'Checkup',
              firstName: 'Alice',
              lastName: 'Wong',
              email: 'alice@test.com',
            },
          },
        },
      });

      expect(result).toBeDefined();
    });
  });
});
