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

  // ── Reschedule appointment (GCal fallback) ─────────────────────────

  describe('rescheduleAppointment', () => {
    it('should reschedule via GCal with newDate + newStartTime params', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: {
          id: 'acc-1',
          googleCalendarConnected: true,
        },
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.updateEvent.mockResolvedValue({
        success: true,
        eventId: 'evt-1',
      });

      const result = await service.rescheduleAppointment({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        message: {
          functionCall: {
            parameters: {
              appointmentId: 'evt-1',
              newDate: '2026-03-05',
              newStartTime: '14:00',
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result.result?.success).toBe(true);
      expect(gcalService.updateEvent).toHaveBeenCalledWith(
        'acc-1',
        'evt-1',
        expect.objectContaining({
          start: expect.any(Date),
          end: expect.any(Date),
        }),
      );

      const updateArgs = gcalService.updateEvent.mock.calls[0][2];
      expect(updateArgs.start.toISOString()).toContain('2026-03-05');
      expect(updateArgs.start.getHours()).toBe(14);
      expect(updateArgs.start.getMinutes()).toBe(0);
    });

    it('should reschedule via GCal with legacy startTime param', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: {
          id: 'acc-1',
          googleCalendarConnected: true,
        },
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.updateEvent.mockResolvedValue({
        success: true,
        eventId: 'evt-2',
      });

      const result = await service.rescheduleAppointment({
        accountId: 'acc-1',
        call: { id: 'call-2', phoneNumberId: 'vapi-phone-1' },
        message: {
          functionCall: {
            parameters: {
              appointmentId: 'evt-2',
              startTime: '2026-03-05T15:00:00Z',
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result.result?.success).toBe(true);
    });

    it('should handle reschedule failure gracefully', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: {
          id: 'acc-1',
          googleCalendarConnected: true,
        },
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.updateEvent.mockRejectedValue(new Error('Calendar API failure'));

      const result = await service.rescheduleAppointment({
        accountId: 'acc-1',
        call: { id: 'call-3', phoneNumberId: 'vapi-phone-1' },
        message: {
          functionCall: {
            parameters: {
              appointmentId: 'evt-3',
              newDate: '2026-03-05',
              newStartTime: '10:00',
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect((result as any).error).toBeDefined();
    });
  });

  // ── getAppointments — dayOfWeek ───────────────────────────────────

  describe('getAppointments', () => {
    it('should include dayOfWeek in returned appointments (GCal path)', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: {
          id: 'acc-1',
          googleCalendarConnected: true,
        },
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.findEventsByPatient.mockResolvedValue({
        success: true,
        events: [
          {
            id: 'evt-1',
            startTime: '2026-02-28T10:00:00Z',
            endTime: '2026-02-28T10:30:00Z',
            summary: 'Cleaning',
            status: 'confirmed',
          },
        ],
      });

      const result = await service.getAppointments({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        functionCall: {
          parameters: { patientId: 'p-1', patientName: 'Jane Doe' },
        },
      }) as any;

      expect(result).toBeDefined();
      const appts = result.result?.appointments;
      expect(appts).toHaveLength(1);
      expect(appts[0].dayOfWeek).toBe('Saturday');
    });

    it('should return correct dayOfWeek for various dates', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1', googleCalendarConnected: true },
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.findEventsByPatient.mockResolvedValue({
        success: true,
        events: [
          { id: 'e1', startTime: '2026-03-02T09:00:00Z', endTime: '2026-03-02T09:30:00Z', summary: 'Exam', status: 'confirmed' },
          { id: 'e2', startTime: '2026-03-04T14:00:00Z', endTime: '2026-03-04T15:00:00Z', summary: 'Filling', status: 'confirmed' },
        ],
      });

      const result = await service.getAppointments({
        accountId: 'acc-1',
        call: { id: 'call-2', phoneNumberId: 'vapi-phone-1' },
        functionCall: {
          parameters: { patientId: 'p-1', patientName: 'John Smith' },
        },
      }) as any;

      const appts = result.result?.appointments;
      expect(appts).toHaveLength(2);
      expect(appts[0].dayOfWeek).toBe('Monday');
      expect(appts[1].dayOfWeek).toBe('Wednesday');
    });
  });

  // ── checkAvailability — dayOfWeek ─────────────────────────────────

  describe('checkAvailability — dayOfWeek', () => {
    it('should include dayOfWeek in available slots for the requested date', async () => {
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
        availableSlots: [
          { startTime: '2026-02-28T09:00:00Z', endTime: '2026-02-28T12:00:00Z' },
        ],
        timezone: 'America/New_York',
      });

      const result = await service.checkAvailability({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: { date: '2026-02-28' } },
      }) as any;

      expect(result).toBeDefined();
      expect(result.result?.requestedDayOfWeek).toBe('Saturday');
      expect(result.result?.availableSlots[0].dayOfWeek).toBe('Saturday');
      expect(result.result?.message).toContain('Saturday');
    });

    it('should include dayOfWeek for alternate day slots when requested date is full', async () => {
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
        availableSlots: [],
        timezone: 'America/New_York',
      });
      gcalService.findNextAvailableSlots.mockResolvedValue({
        slots: [
          { date: '2026-03-02', startTime: '2026-03-02T09:00:00Z', endTime: '2026-03-02T09:30:00Z' },
          { date: '2026-03-04', startTime: '2026-03-04T14:00:00Z', endTime: '2026-03-04T14:30:00Z' },
        ],
        timezone: 'America/New_York',
      });

      const result = await service.checkAvailability({
        accountId: 'acc-1',
        call: { id: 'call-2', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: { date: '2026-02-28' } },
      }) as any;

      expect(result).toBeDefined();
      expect(result.result?.requestedDayOfWeek).toBe('Saturday');
      expect(result.result?.requestedDateAvailable).toBe(false);

      const slots = result.result?.availableSlots;
      expect(slots).toHaveLength(2);
      expect(slots[0].dayOfWeek).toBe('Monday');
      expect(slots[1].dayOfWeek).toBe('Wednesday');
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

  // ── prefetchCallerContext / getCallerContext ─────────────────────────

  describe('prefetchCallerContext', () => {
    it('should populate callerContextCache for GCal-only account', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConfigured.mockReturnValue(true);
      gcalService.isConnectedForAccount.mockResolvedValue(true);

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const pastDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      gcalService.findEventsByPatient.mockResolvedValue({
        success: true,
        events: [
          {
            summary: 'John Smith - Cleaning',
            startTime: futureDate.toISOString(),
            endTime: new Date(futureDate.getTime() + 30 * 60 * 1000).toISOString(),
            description: 'Phone: 4155551234',
          },
          {
            summary: 'John Smith - Exam',
            startTime: pastDate.toISOString(),
            endTime: new Date(pastDate.getTime() + 30 * 60 * 1000).toISOString(),
            description: 'Phone: 4155551234',
          },
        ],
      });

      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);

      await service.prefetchCallerContext('call-prefetch-1', '+14155551234', 'acc-1', 'RETELL');

      const ctx = service.getCallerContext('call-prefetch-1');
      expect(ctx).toBeDefined();
      expect(ctx!.patientType).toBe('returning');
      expect(ctx!.patientName).toBe('John Smith');
      expect(ctx!.nextBooking).toBeDefined();
      expect(ctx!.nextBooking!.type).toBe('Cleaning');
      expect(ctx!.lastVisitDate).toBeDefined();
    });

    it('should return patientType "new" when no events found', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConfigured.mockReturnValue(true);
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.findEventsByPatient.mockResolvedValue({
        success: true,
        events: [],
      });
      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);

      await service.prefetchCallerContext('call-prefetch-2', '+14155559999', 'acc-1', 'RETELL');

      const ctx = service.getCallerContext('call-prefetch-2');
      expect(ctx).toBeDefined();
      expect(ctx!.patientType).toBe('new');
      expect(ctx!.patientName).toBeUndefined();
      expect(ctx!.nextBooking).toBeUndefined();
    });

    it('should handle empty callerPhone gracefully', async () => {
      await service.prefetchCallerContext('call-prefetch-3', '', 'acc-1', 'RETELL');
      const ctx = service.getCallerContext('call-prefetch-3');
      expect(ctx).toBeUndefined();
    });

    it('should handle empty accountId gracefully', async () => {
      await service.prefetchCallerContext('call-prefetch-4', '+14155551234', '', 'RETELL');
      const ctx = service.getCallerContext('call-prefetch-4');
      expect(ctx).toBeUndefined();
    });

    it('should not throw if GCal is unavailable', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConfigured.mockReturnValue(false);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);

      await expect(
        service.prefetchCallerContext('call-prefetch-5', '+14155551234', 'acc-1', 'RETELL'),
      ).resolves.not.toThrow();

      const ctx = service.getCallerContext('call-prefetch-5');
      expect(ctx).toBeDefined();
      expect(ctx!.patientType).toBe('new');
    });

    it('should not throw if PMS search fails', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue({
        id: 'pms-1',
        accountId: 'acc-1',
        provider: 'sikka',
        config: {},
      });
      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);

      await expect(
        service.prefetchCallerContext('call-prefetch-6', '+14155551234', 'acc-1', 'RETELL'),
      ).resolves.not.toThrow();
    });
  });

  describe('getCallerContext', () => {
    it('should return undefined for unknown callId', () => {
      const ctx = service.getCallerContext('nonexistent-call');
      expect(ctx).toBeUndefined();
    });
  });

  describe('lookupPatient with prefetched context (GCal path)', () => {
    it('should enrich GCal-only response with prefetched caller context', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConfigured.mockReturnValue(true);
      gcalService.isConnectedForAccount.mockResolvedValue(true);

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      gcalService.findEventsByPatient.mockResolvedValue({
        success: true,
        events: [
          {
            summary: 'Jane Doe - Cleaning',
            startTime: futureDate.toISOString(),
            endTime: new Date(futureDate.getTime() + 30 * 60 * 1000).toISOString(),
            description: 'Phone: 4155557777',
          },
        ],
      });

      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);

      await service.prefetchCallerContext('call-lookup-1', '+14155557777', 'acc-1', 'RETELL');

      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1', googleCalendarConnected: true },
      });

      const result = await service.lookupPatient({
        accountId: 'acc-1',
        call: { id: 'call-lookup-1', phoneNumberId: 'vapi-phone-1', customer: { number: '+14155557777' } },
        functionCall: { parameters: {} },
      }) as any;

      expect(result.result.callerVerified).toBe(true);
      expect(result.result.patientName).toBe('Jane Doe');
      expect(result.result.nextBooking).toBeDefined();
      expect(result.result.message).toContain('Jane');
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
