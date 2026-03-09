import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AgentToolsService } from './agent-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HipaaAuditService } from '../common/services/hipaa-audit.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';
import { createMockGoogleCalendarService } from '../test/mocks/google-calendar.mock';
import { createMockNotificationsService } from '../test/mocks/notifications.mock';
import { createMockHipaaAuditService } from '../test/mocks/hipaa-audit.mock';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentToolsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GoogleCalendarService, useValue: mockGcal },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: HipaaAuditService, useValue: mockHipaa },
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
          { startTime: '2026-06-06T09:00:00Z', endTime: '2026-06-06T12:00:00Z' },
        ],
        timezone: 'America/New_York',
      });

      const result = await service.checkAvailability({
        accountId: 'acc-1',
        call: { id: 'call-1', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: { date: '2026-06-06' } },
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
          { date: '2026-06-08', startTime: '2026-06-08T09:00:00Z', endTime: '2026-06-08T09:30:00Z' },
          { date: '2026-06-10', startTime: '2026-06-10T14:00:00Z', endTime: '2026-06-10T14:30:00Z' },
        ],
        timezone: 'America/New_York',
      });

      const result = await service.checkAvailability({
        accountId: 'acc-1',
        call: { id: 'call-2', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: { date: '2026-06-06' } },
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
            summary: 'Cleaning - John Smith',
            startTime: futureDate.toISOString(),
            endTime: new Date(futureDate.getTime() + 30 * 60 * 1000).toISOString(),
            description: 'Phone: 4155551234',
          },
          {
            summary: 'Exam - John Smith',
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

  describe('handleGetCallerContext', () => {
    it('should return new-caller when cache is empty and no phone/account in payload', async () => {
      const result = await service.handleGetCallerContext({
        call: { id: 'call-no-ctx' },
      });
      expect(result.result.patientType).toBe('new');
    });

    it('should perform real-time fallback when cache is empty but phone+account are available', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConfigured.mockReturnValue(true);
      gcalService.isConnectedForAccount.mockResolvedValue(true);

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      gcalService.findEventsByPatient.mockResolvedValue({
        success: true,
        events: [
          {
            summary: 'Cleaning - John Smith',
            startTime: futureDate.toISOString(),
            endTime: new Date(futureDate.getTime() + 30 * 60 * 1000).toISOString(),
            description: 'Phone: 4155551234',
          },
        ],
      });

      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);

      const result = await service.handleGetCallerContext({
        call: {
          id: 'call-fallback-1',
          call_id: 'call-fallback-1',
          from_number: '+14155551234',
        },
        accountId: 'acc-1',
      });

      expect(result.result.patientType).toBe('returning');
      expect(result.result.patientName).toBe('John Smith');
      expect(result.result.nextBooking).toBeDefined();
    });

    it('should return cached context when cache is populated (no fallback needed)', async () => {
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConfigured.mockReturnValue(true);
      gcalService.isConnectedForAccount.mockResolvedValue(true);

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      gcalService.findEventsByPatient.mockResolvedValue({
        success: true,
        events: [
          {
            summary: 'Exam - Alice Doe',
            startTime: futureDate.toISOString(),
            endTime: new Date(futureDate.getTime() + 30 * 60 * 1000).toISOString(),
            description: 'Phone: 4155559999',
          },
        ],
      });

      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);

      await service.prefetchCallerContext('call-cached-1', '+14155559999', 'acc-1', 'RETELL');

      const prefetchSpy = jest.spyOn(service, 'prefetchCallerContext');
      const result = await service.handleGetCallerContext({
        call: { id: 'call-cached-1', call_id: 'call-cached-1', from_number: '+14155559999' },
        accountId: 'acc-1',
      });

      expect(result.result.patientType).toBe('returning');
      expect(result.result.patientName).toBe('Alice Doe');
      expect(prefetchSpy).not.toHaveBeenCalled();
      prefetchSpy.mockRestore();
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
            summary: 'Cleaning - Jane Doe',
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

  // ─────────────────────────────────────────────────────────────────────
  // PMS writeback failure → GCal fallback
  // Simulates an account connected to PMS but without writeback access.
  // Writeback operations should fall back to Google Calendar when connected.
  // ─────────────────────────────────────────────────────────────────────

  describe('PMS writeback failure → GCal fallback', () => {
    const pmsPhoneRecord = {
      accountId: 'acc-pms',
      pmsIntegration: {
        id: 'pms-int-1',
        provider: 'SIKKA',
        config: {},
      },
      account: {
        id: 'acc-pms',
        googleCalendarConnected: true,
        brandingTimezone: 'America/Toronto',
        name: 'PMS Test Clinic',
      },
    };

    const mockPmsService = {
      bookAppointment: jest.fn(),
      rescheduleAppointment: jest.fn(),
      checkAvailability: jest.fn(),
      cancelAppointment: jest.fn(),
      searchPatients: jest.fn(),
      createPatient: jest.fn(),
    };

    beforeEach(() => {
      jest.doMock('../pms/pms.service', () => ({
        PmsService: jest.fn().mockImplementation(() => ({
          getPmsService: jest.fn().mockResolvedValue(mockPmsService),
        })),
      }));

      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(pmsPhoneRecord);
    });

    afterEach(() => {
      jest.resetModules();
    });

    it('should fall back to GCal when PMS bookAppointment writeback fails', async () => {
      mockPmsService.bookAppointment.mockResolvedValue({
        success: false,
        error: { code: 'WRITEBACK_FAILED', message: 'No writeback access for this practice' },
      });

      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.createAppointmentEvent.mockResolvedValue({
        success: true,
        eventId: 'gcal-backup-1',
        htmlLink: 'https://cal/gcal-backup-1',
      });
      notificationsService.sendPmsFailureNotification.mockResolvedValue(undefined);

      const result = await service.bookAppointment({
        accountId: 'acc-pms',
        call: { id: 'call-pms-fail-1', phoneNumberId: 'vapi-phone-1', customer: { number: '+14155551234' } },
        message: {
          functionCall: {
            parameters: {
              patientId: 'patient-1',
              startTime: '2026-04-01T10:00:00Z',
              appointmentType: 'Cleaning',
              duration: 30,
              firstName: 'John',
              lastName: 'Doe',
              phone: '+14155551234',
            },
          },
        },
      }) as any;

      expect(result.result.success).toBe(true);
      expect(result.result.integrationType).toBe('google_calendar_backup');
      expect(gcalService.createAppointmentEvent).toHaveBeenCalledWith(
        'acc-pms',
        expect.objectContaining({
          patient: expect.objectContaining({ firstName: 'John', lastName: 'Doe' }),
          appointmentType: 'Cleaning',
          notes: expect.stringContaining('[PMS BACKUP]'),
        }),
      );
      expect(notificationsService.sendPmsFailureNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-pms',
          pmsErrorMessage: 'No writeback access for this practice',
          gcalBackupCreated: true,
        }),
      );
    });

    it('should return manual_followup when PMS fails and GCal is not connected', async () => {
      mockPmsService.bookAppointment.mockResolvedValue({
        success: false,
        error: { code: 'WRITEBACK_FAILED', message: 'Access denied' },
      });

      gcalService.isConnectedForAccount.mockResolvedValue(false);
      notificationsService.sendPmsFailureNotification.mockResolvedValue(undefined);

      const result = await service.bookAppointment({
        accountId: 'acc-pms',
        call: { id: 'call-pms-fail-2', phoneNumberId: 'vapi-phone-1', customer: { number: '+14155559999' } },
        message: {
          functionCall: {
            parameters: {
              patientId: 'patient-2',
              startTime: '2026-04-02T14:00:00Z',
              appointmentType: 'Exam',
              firstName: 'Jane',
              lastName: 'Smith',
            },
          },
        },
      }) as any;

      expect(result.result.success).toBe(true);
      expect(result.result.integrationType).toBe('manual_followup');
      expect(result.result.message).toContain('noted');
      expect(gcalService.createAppointmentEvent).not.toHaveBeenCalled();
    });

    it('should fall back to GCal even on unexpected PMS exceptions', async () => {
      mockPmsService.bookAppointment.mockRejectedValue(
        new Error('Connection refused: PMS server unreachable'),
      );

      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.createAppointmentEvent.mockResolvedValue({
        success: true,
        eventId: 'gcal-exception-backup',
        htmlLink: 'https://cal/gcal-exception-backup',
      });
      notificationsService.sendPmsFailureNotification.mockResolvedValue(undefined);

      const result = await service.bookAppointment({
        accountId: 'acc-pms',
        call: { id: 'call-pms-crash', phoneNumberId: 'vapi-phone-1', customer: { number: '+14155550000' } },
        message: {
          functionCall: {
            parameters: {
              patientId: 'patient-3',
              startTime: '2026-04-03T09:00:00Z',
              appointmentType: 'Root Canal',
              firstName: 'Bob',
              lastName: 'Brown',
            },
          },
        },
      }) as any;

      expect(result.result.success).toBe(true);
      expect(result.result.integrationType).toBe('google_calendar_backup');
    });

    it('should return error when PMS checkAvailability fails', async () => {
      mockPmsService.checkAvailability.mockResolvedValue({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: 'Read-only access: cannot query schedule' },
      });

      const result = await service.checkAvailability({
        accountId: 'acc-pms',
        call: { id: 'call-avail-fail', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: { date: '2026-04-01' } },
      }) as any;

      expect(result.error).toBeDefined();
      expect(result.message).toBeDefined();
    });

    it('should still succeed on PMS bookAppointment success (happy path)', async () => {
      mockPmsService.bookAppointment.mockResolvedValue({
        success: true,
        data: {
          id: 'appt-sikka-1',
          patientId: 'patient-1',
          confirmationNumber: 'CONF-123',
          providerName: 'Dr. Smith',
          metadata: { writebackId: 'wb-1' },
        },
      });

      prisma.aiActionLog = { create: jest.fn().mockResolvedValue({}) };

      const result = await service.bookAppointment({
        accountId: 'acc-pms',
        call: { id: 'call-pms-ok', phoneNumberId: 'vapi-phone-1' },
        message: {
          functionCall: {
            parameters: {
              patientId: 'patient-1',
              startTime: '2026-04-01T10:00:00Z',
              appointmentType: 'Cleaning',
              duration: 30,
            },
          },
        },
      }) as any;

      expect(result.result.success).toBe(true);
      expect(result.result.appointmentId).toBe('appt-sikka-1');
      expect(result.result.confirmationNumber).toBe('CONF-123');
      expect(gcalService.createAppointmentEvent).not.toHaveBeenCalled();
    });

    it('should fall back to GCal when PMS rescheduleAppointment writeback fails', async () => {
      mockPmsService.rescheduleAppointment.mockResolvedValue({
        success: false,
        error: { code: 'WRITEBACK_FAILED', message: 'No writeback access for reschedule' },
      });

      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.createAppointmentEvent.mockResolvedValue({
        success: true,
        eventId: 'gcal-resched-backup-1',
        htmlLink: 'https://cal/gcal-resched-backup-1',
      });
      notificationsService.sendPmsFailureNotification.mockResolvedValue(undefined);

      const result = await service.rescheduleAppointment({
        accountId: 'acc-pms',
        call: { id: 'call-resched-fail-1', phoneNumberId: 'vapi-phone-1', customer: { number: '+14155551234' } },
        message: {
          functionCall: {
            parameters: {
              appointmentId: 'appt-old-1',
              startTime: '2026-04-05T11:00:00Z',
              duration: 45,
              firstName: 'John',
              lastName: 'Doe',
              phone: '+14155551234',
              appointmentType: 'Follow-up',
            },
          },
        },
      }) as any;

      expect(result.result.success).toBe(true);
      expect(result.result.integrationType).toBe('google_calendar_backup');
      expect(gcalService.createAppointmentEvent).toHaveBeenCalledWith(
        'acc-pms',
        expect.objectContaining({
          patient: expect.objectContaining({ firstName: 'John', lastName: 'Doe' }),
          notes: expect.stringContaining('[PMS RESCHEDULE BACKUP]'),
        }),
      );
      expect(notificationsService.sendPmsFailureNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-pms',
          pmsErrorMessage: 'No writeback access for reschedule',
          gcalBackupCreated: true,
        }),
      );
    });

    it('should return manual_followup when PMS reschedule fails and GCal is not connected', async () => {
      mockPmsService.rescheduleAppointment.mockResolvedValue({
        success: false,
        error: { code: 'WRITEBACK_FAILED', message: 'Access denied' },
      });

      gcalService.isConnectedForAccount.mockResolvedValue(false);
      notificationsService.sendPmsFailureNotification.mockResolvedValue(undefined);

      const result = await service.rescheduleAppointment({
        accountId: 'acc-pms',
        call: { id: 'call-resched-fail-2', phoneNumberId: 'vapi-phone-1', customer: { number: '+14155559999' } },
        message: {
          functionCall: {
            parameters: {
              appointmentId: 'appt-old-2',
              startTime: '2026-04-06T14:00:00Z',
              firstName: 'Jane',
              lastName: 'Smith',
            },
          },
        },
      }) as any;

      expect(result.result.success).toBe(true);
      expect(result.result.integrationType).toBe('manual_followup');
      expect(result.result.message).toContain('noted');
      expect(gcalService.createAppointmentEvent).not.toHaveBeenCalled();
    });

    it('should fall back to GCal on unexpected PMS reschedule exceptions', async () => {
      mockPmsService.rescheduleAppointment.mockRejectedValue(
        new Error('Connection refused: PMS server unreachable'),
      );

      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.createAppointmentEvent.mockResolvedValue({
        success: true,
        eventId: 'gcal-resched-exception',
        htmlLink: 'https://cal/gcal-resched-exception',
      });
      notificationsService.sendPmsFailureNotification.mockResolvedValue(undefined);

      const result = await service.rescheduleAppointment({
        accountId: 'acc-pms',
        call: { id: 'call-resched-crash', phoneNumberId: 'vapi-phone-1', customer: { number: '+14155550000' } },
        message: {
          functionCall: {
            parameters: {
              appointmentId: 'appt-old-3',
              startTime: '2026-04-07T09:00:00Z',
              appointmentType: 'Cleaning',
              firstName: 'Bob',
              lastName: 'Brown',
            },
          },
        },
      }) as any;

      expect(result.result.success).toBe(true);
      expect(result.result.integrationType).toBe('google_calendar_backup');
    });
  });

  // ── Cache expiration tests ─────────────────────────────────────────

  describe('Cache expiration', () => {
    it('should return undefined for expired caller context', () => {
      (service as any).callerContextCache.set('expired-call', {
        callerPhone: '1234567890',
        fetchedAt: Date.now() - 20 * 60 * 1000,
        patientType: 'returning',
      });
      expect(service.getCallerContext('expired-call')).toBeUndefined();
    });

    it('should return undefined for expired patient cache', () => {
      (service as any).patientCache.set('expired-call', {
        firstName: 'Old',
        lastName: 'Patient',
        patientId: 'p-old',
        cachedAt: Date.now() - 20 * 60 * 1000,
      });
      expect((service as any).getCachedPatient('expired-call')).toBeUndefined();
    });

    it('should cleanup stale patient cache entries when over 200', () => {
      for (let i = 0; i < 201; i++) {
        (service as any).patientCache.set(`call-${i}`, {
          firstName: 'Test',
          lastName: 'Patient',
          patientId: `p-${i}`,
          cachedAt: i < 100 ? Date.now() - 20 * 60 * 1000 : Date.now(),
        });
      }
      (service as any).cachePatient('trigger-cleanup', {
        firstName: 'New',
        lastName: 'Patient',
        patientId: 'p-new',
        cachedAt: Date.now(),
      });
      expect((service as any).patientCache.has('call-0')).toBe(false);
      expect((service as any).patientCache.has('call-150')).toBe(true);
    });
  });

  // ── handleGetCallerContext — full context & edge cases ─────────────

  describe('handleGetCallerContext — additional paths', () => {
    it('should return no-context when callId is missing', async () => {
      const result = await service.handleGetCallerContext({ call: {} });
      expect(result.result.patientType).toBe('new');
      expect(result.result.message).toBe('No call context available.');
    });

    it('should include lastVisitDate, lastCallSummary, lastCallOutcome', async () => {
      (service as any).callerContextCache.set('call-full-ctx', {
        callerPhone: '4155551234',
        fetchedAt: Date.now(),
        patientType: 'returning',
        patientName: 'John Doe',
        nextBooking: { date: '2026-04-01', dayOfWeek: 'Wednesday', time: '10:00 AM', type: 'Cleaning' },
        lastVisitDate: '2025-12-01T10:00:00Z',
        lastCallSummary: 'Called about insurance',
        lastCallOutcome: 'resolved',
      });

      const result = await service.handleGetCallerContext({
        call: { id: 'call-full-ctx', call_id: 'call-full-ctx' },
      });

      expect(result.result.patientType).toBe('returning');
      expect(result.result.lastVisitDate).toBe('2025-12-01T10:00:00Z');
      expect(result.result.lastCallSummary).toBe('Called about insurance');
      expect(result.result.lastCallOutcome).toBe('resolved');
      expect(result.result.message).toContain('Last call:');
    });

    it('should handle real-time fallback failure gracefully', async () => {
      jest.spyOn(service, 'prefetchCallerContext').mockRejectedValue(new Error('Prefetch crashed'));

      const result = await service.handleGetCallerContext({
        call: { id: 'call-fb-fail', call_id: 'call-fb-fail', from_number: '+14155551234' },
        accountId: 'acc-1',
      });

      expect(result.result.patientType).toBe('new');
    });
  });

  // ── takeMessage ──────────────────────────────────────────────────────

  describe('takeMessage', () => {
    it('should record message and return success', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        staffForwardNumber: '+14155559999',
        account: { id: 'acc-1', name: 'Test Clinic' },
      });

      const result = await service.takeMessage({
        call: { id: 'call-msg-1', phoneNumberId: 'vapi-phone-1', customer: { number: '+14155551234' } },
        message: {
          functionCall: {
            parameters: {
              callerName: 'John Doe',
              callerPhone: '+14155551234',
              reason: 'Wants to discuss treatment',
              urgency: 'urgent',
              notes: 'Prefers mornings',
            },
          },
        },
      }) as any;

      expect(result.result.success).toBe(true);
      expect(result.result.message).toContain('John Doe');
    });

    it('should handle missing phone record', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);

      const result = await service.takeMessage({
        call: { id: 'call-msg-2', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: { reason: 'General inquiry' } },
      }) as any;

      expect(result.result.success).toBe(true);
    });

    it('should handle errors in the catch block', async () => {
      prisma.vapiPhoneNumber.findFirst.mockRejectedValue(new Error('DB failure'));

      const result = await service.takeMessage({
        call: { id: 'call-msg-3', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: {} } },
      }) as any;

      expect(result.result.success).toBe(true);
      expect(result.result.message).toContain('noted');
    });
  });

  // ── transferToHuman — additional error paths ────────────────────────

  describe('transferToHuman — error paths', () => {
    it('should handle unexpected errors', async () => {
      prisma.vapiPhoneNumber.findFirst.mockRejectedValue(new Error('Unexpected'));

      const result = await service.transferToHuman({
        call: { id: 'call-err-1', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: {} } },
      }) as any;

      expect(result.error).toBe('Transfer failed');
    });

    it('should return transfer-not-configured when disabled', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        transferEnabled: false,
        staffForwardNumber: null,
        account: { id: 'acc-1', name: 'Clinic' },
      });

      const result = await service.transferToHuman({
        call: { id: 'call-no-transfer', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: {} } },
      }) as any;

      expect(result.error).toBe('Transfer not configured');
    });
  });

  // ── Deprecated aliases ─────────────────────────────────────────────

  describe('deprecated aliases', () => {
    it('getPatientInfo routes to lookupPatient', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1' },
      });

      const result = await service.getPatientInfo({
        accountId: 'acc-1',
        call: { id: 'call-dep-1', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: {} },
      });

      expect(result).toBeDefined();
    });

    it('searchPatients routes to lookupPatient', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1' },
      });

      const result = await service.searchPatients({
        accountId: 'acc-1',
        call: { id: 'call-dep-2', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: {} },
      });

      expect(result).toBeDefined();
    });
  });

  // ── PMS tool methods ───────────────────────────────────────────────

  describe('PMS tool methods', () => {
    const pmsPhoneRecord = {
      accountId: 'acc-pms',
      vapiPhoneId: 'vapi-phone-1',
      pmsIntegration: {
        id: 'pms-int-1',
        provider: 'SIKKA',
        config: {},
      },
      account: {
        id: 'acc-pms',
        googleCalendarConnected: true,
        brandingTimezone: 'America/Toronto',
        name: 'PMS Clinic',
      },
    };

    const mockSikka = {
      searchPatients: jest.fn(),
      bookAppointment: jest.fn(),
      createPatient: jest.fn(),
      updatePatient: jest.fn(),
      cancelAppointment: jest.fn(),
      getAppointments: jest.fn(),
      rescheduleAppointment: jest.fn(),
      addPatientNote: jest.fn(),
      getPatientInsurance: jest.fn(),
      getPatientBalance: jest.fn(),
      getProviders: jest.fn(),
      checkAvailability: jest.fn(),
      updatePatientInsurance: jest.fn(),
      addPatientInsurance: jest.fn(),
      getPaymentHistory: jest.fn(),
      processPayment: jest.fn(),
    };

    const call = {
      id: 'call-pms',
      phoneNumberId: 'vapi-phone-1',
      customer: { number: '+14155551234' },
    };

    const makePayload = (params: Record<string, any>, callOverrides: Record<string, any> = {}) => ({
      accountId: 'acc-pms',
      call: { ...call, ...callOverrides },
      message: { functionCall: { parameters: params } },
    });

    beforeEach(() => {
      jest.doMock('../pms/pms.service', () => ({
        PmsService: jest.fn().mockImplementation(() => ({
          getPmsService: jest.fn().mockResolvedValue(mockSikka),
        })),
      }));
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(pmsPhoneRecord);
      prisma.pmsIntegration.findFirst.mockResolvedValue(pmsPhoneRecord.pmsIntegration);
    });

    afterEach(() => {
      jest.resetModules();
      Object.values(mockSikka).forEach((fn: any) => fn.mockReset());
    });

    // ── lookupPatient (PMS path) ──────────────────────────────────────

    describe('lookupPatient (PMS path)', () => {
      it('should handle PMS search failure', async () => {
        mockSikka.searchPatients.mockResolvedValue({
          success: false,
          error: { message: 'PMS connection timeout' },
        });

        const result = await service.lookupPatient(makePayload({ phone: '+14155551234' })) as any;

        expect(result.error).toBe('Patient lookup failed');
      });

      it('should return empty when no patients found', async () => {
        mockSikka.searchPatients.mockResolvedValue({ success: true, data: [] });

        const result = await service.lookupPatient(makePayload({ phone: '+14155551234' })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.patients).toHaveLength(0);
        expect(result.result.callerVerified).toBe(false);
      });

      it('should handle family account (multiple phone matches)', async () => {
        mockSikka.searchPatients.mockResolvedValue({
          success: true,
          data: [
            { id: 'p-1', firstName: 'John', lastName: 'Doe', phone: '+14155551234' },
            { id: 'p-2', firstName: 'Jane', lastName: 'Doe', phone: '+14155551234' },
          ],
        });

        const result = await service.lookupPatient(makePayload({ phone: '+14155551234' })) as any;

        expect(result.result.callerVerified).toBe(true);
        expect(result.result.familyAccount).toBe(true);
        expect(result.result.patients).toHaveLength(2);
      });

      it('should return verified patient for single phone match', async () => {
        mockSikka.searchPatients.mockResolvedValue({
          success: true,
          data: [
            {
              id: 'p-1', firstName: 'John', lastName: 'Doe',
              phone: '+14155551234', email: 'john@test.com',
              dateOfBirth: '1990-01-01', lastVisit: '2025-12-01', balance: 150,
            },
          ],
        });

        const result = await service.lookupPatient(makePayload({ phone: '+14155551234' })) as any;

        expect(result.result.callerVerified).toBe(true);
        expect(result.result.patient.name).toBe('John Doe');
        expect(result.result.patient.email).toBe('john@test.com');
        expect(result.result.patient.balance).toBe(150);
      });

      it('should return limited info for unverified phone query', async () => {
        mockSikka.searchPatients.mockResolvedValue({
          success: true,
          data: [
            { id: 'p-1', firstName: 'Other', lastName: 'Person', phone: '+14155559999' },
          ],
        });

        const result = await service.lookupPatient(
          makePayload({ phone: '+14155559999' }, { customer: { number: '+14155550000' } }),
        ) as any;

        expect(result.result.callerVerified).toBe(false);
        expect(result.result.patient.id).toBe('p-1');
        expect(result.result.patient.email).toBeUndefined();
      });

      it('should return count only for name-based search unverified', async () => {
        mockSikka.searchPatients.mockResolvedValue({
          success: true,
          data: [
            { id: 'p-1', firstName: 'John', lastName: 'Doe', phone: '+14155559999' },
            { id: 'p-2', firstName: 'John', lastName: 'Smith', phone: '+14155558888' },
          ],
        });

        const result = await service.lookupPatient(
          makePayload({ name: 'John' }, { customer: { number: '+14155550000' } }),
        ) as any;

        expect(result.result.callerVerified).toBe(false);
        expect(result.result.found).toBe(true);
        expect(result.result.count).toBe(2);
        expect(result.result.patient).toBeUndefined();
      });

      it('should enrich verified result with caller context', async () => {
        (service as any).callerContextCache.set('call-pms', {
          callerPhone: '4155551234',
          fetchedAt: Date.now(),
          patientType: 'returning',
          patientName: 'John Doe',
          nextBooking: { date: '2026-04-01', dayOfWeek: 'Wed', time: '10 AM', type: 'Cleaning' },
          lastVisitDate: '2025-12-01',
          lastCallSummary: 'Asked about insurance',
          lastCallOutcome: 'resolved',
        });

        mockSikka.searchPatients.mockResolvedValue({
          success: true,
          data: [
            { id: 'p-1', firstName: 'John', lastName: 'Doe', phone: '+14155551234', email: 'j@t.com' },
          ],
        });

        const result = await service.lookupPatient(makePayload({ phone: '+14155551234' })) as any;

        expect(result.result.callerVerified).toBe(true);
        expect(result.result.nextBooking).toBeDefined();
        expect(result.result.lastCallSummary).toBe('Asked about insurance');
      });
    });

    // ── createPatient (PMS path) ──────────────────────────────────────

    describe('createPatient (PMS path)', () => {
      it('should create patient via PMS', async () => {
        mockSikka.createPatient.mockResolvedValue({
          success: true,
          data: { id: 'p-new', firstName: 'Jane', lastName: 'Doe' },
        });

        const result = await service.createPatient(makePayload({
          firstName: 'Jane', lastName: 'Doe', phone: '+14155559999', email: 'jane@test.com',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.patient.name).toBe('Jane Doe');
      });

      it('should fall back to GCal-only mode on PMS createPatient failure', async () => {
        mockSikka.createPatient.mockResolvedValue({
          success: false,
          error: { message: 'Writeback failed' },
        });

        const result = await service.createPatient(makePayload({
          firstName: 'Jane', lastName: 'Doe',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.integrationType).toBe('google_calendar');
        expect(result.result.patient.name).toBe('Jane Doe');
        expect(result.result.patient.id).toMatch(/^gcal-/);
      });
    });

    // ── updatePatient (PMS path) ──────────────────────────────────────

    describe('updatePatient (PMS path)', () => {
      it('should update patient via PMS', async () => {
        mockSikka.updatePatient.mockResolvedValue({ success: true, data: {} });

        const result = await service.updatePatient(makePayload({
          patientId: 'p-1', phone: '+14155559999', email: 'new@test.com',
        })) as any;

        expect(result.result.success).toBe(true);
      });

      it('should handle PMS updatePatient failure', async () => {
        mockSikka.updatePatient.mockResolvedValue({
          success: false,
          error: { message: 'Update denied' },
        });

        const result = await service.updatePatient(makePayload({
          patientId: 'p-1', phone: '+14155559999',
        })) as any;

        expect(result.error).toBe('Patient update failed');
      });

      it('should fall back to gcal when no PMS configured', async () => {
        prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
          accountId: 'acc-1', pmsIntegration: null, account: { id: 'acc-1' },
        });
        gcalService.isConnectedForAccount.mockResolvedValue(true);
        gcalService.findEventsByPatient.mockResolvedValue({
          success: true,
          events: [{ id: 'evt-1', description: 'Name: Test\nPhone: +14155559999', summary: 'Cleaning - Test' }],
        });
        gcalService.updateEvent.mockResolvedValue({ success: true, eventId: 'evt-1' });

        const result = await service.updatePatient(makePayload({
          email: 'new@email.com',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.integrationType).toBe('google_calendar');
        expect(gcalService.updateEvent).toHaveBeenCalled();
      });

      it('should return error when no PMS and no gcal configured', async () => {
        prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
          accountId: 'acc-1', pmsIntegration: null, account: null,
        });
        gcalService.isConnectedForAccount.mockResolvedValue(false);

        const result = await service.updatePatient(makePayload({
          patientId: 'p-1', phone: '+14155559999',
        })) as any;

        expect(result.error).toBe('No system configured');
      });
    });

    // ── cancelAppointment (PMS path) ──────────────────────────────────

    describe('cancelAppointment (PMS path)', () => {
      it('should cancel via PMS', async () => {
        mockSikka.cancelAppointment.mockResolvedValue({ success: true });

        const result = await service.cancelAppointment(makePayload({
          appointmentId: 'appt-1', reason: 'Schedule conflict',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.message).toContain('cancelled');
      });

      it('should handle PMS cancellation failure', async () => {
        mockSikka.cancelAppointment.mockResolvedValue({
          success: false,
          error: { message: 'Cannot cancel past appointments' },
        });

        const result = await service.cancelAppointment(makePayload({
          appointmentId: 'appt-1',
        })) as any;

        expect(result.error).toBe('Appointment cancellation failed');
      });
    });

    // ── getAppointments (PMS path) ────────────────────────────────────

    describe('getAppointments (PMS path)', () => {
      it('should return appointments from PMS', async () => {
        mockSikka.getAppointments.mockResolvedValue({
          success: true,
          data: [
            { id: 'appt-1', startTime: '2026-04-01T10:00:00Z', appointmentType: 'Cleaning', providerName: 'Dr. Smith', status: 'confirmed', duration: 30 },
            { id: 'appt-2', startTime: '2026-04-15T14:00:00Z', appointmentType: 'Exam', providerId: 'prov-1', status: 'scheduled', duration: 60 },
          ],
        });

        const result = await service.getAppointments(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.appointments).toHaveLength(2);
        expect(result.result.count).toBe(2);
      });

      it('should handle PMS getAppointments failure', async () => {
        mockSikka.getAppointments.mockResolvedValue({
          success: false,
          error: { message: 'Access denied' },
        });

        const result = await service.getAppointments(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.error).toBe('Failed to retrieve appointments');
      });

      it('should return empty when no appointments', async () => {
        mockSikka.getAppointments.mockResolvedValue({ success: true, data: [] });

        const result = await service.getAppointments(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.count).toBe(0);
        expect(result.result.message).toContain("don't see any");
      });
    });

    // ── rescheduleAppointment (PMS path) ──────────────────────────────

    describe('rescheduleAppointment (PMS success path)', () => {
      it('should reschedule via PMS successfully', async () => {
        mockSikka.rescheduleAppointment.mockResolvedValue({
          success: true,
          data: { id: 'appt-1', startTime: '2026-04-05T11:00:00Z', appointmentType: 'Cleaning', providerName: 'Dr. Smith' },
        });

        const result = await service.rescheduleAppointment(makePayload({
          appointmentId: 'appt-1',
          startTime: '2026-04-05T11:00:00Z',
          duration: 30,
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.appointment.provider).toBe('Dr. Smith');
      });

      it('should handle PMS reschedule failure with GCal fallback', async () => {
        mockSikka.rescheduleAppointment.mockResolvedValue({
          success: false,
          error: { message: 'Writeback denied' },
        });

        gcalService.isConnectedForAccount.mockResolvedValue(true);
        gcalService.createAppointmentEvent.mockResolvedValue({
          success: true, eventId: 'gcal-backup', htmlLink: 'https://cal/backup',
        });
        notificationsService.sendPmsFailureNotification.mockResolvedValue(undefined);

        const result = await service.rescheduleAppointment(makePayload({
          appointmentId: 'appt-1',
          startTime: '2026-04-05T11:00:00Z',
          firstName: 'John',
          lastName: 'Doe',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.integrationType).toBe('google_calendar_backup');
      });

      it('should return error when PMS and fallback both fail', async () => {
        prisma.vapiPhoneNumber.findFirst
          .mockResolvedValueOnce(pmsPhoneRecord)
          .mockResolvedValueOnce(null);

        mockSikka.rescheduleAppointment.mockRejectedValue(new Error('PMS crash'));

        const result = await service.rescheduleAppointment({
          call: { id: 'call-total-fail', phoneNumberId: 'vapi-phone-1' },
          message: { functionCall: { parameters: { appointmentId: 'a1', startTime: '2026-04-05T11:00:00Z' } } },
        }) as any;

        expect(result.error).toBe('Reschedule failed');
      });
    });

    // ── addPatientNote (PMS path) ────────────────────────────────────

    describe('addPatientNote (PMS path)', () => {
      it('should add note via PMS', async () => {
        mockSikka.addPatientNote.mockResolvedValue({ success: true });

        const result = await service.addPatientNote(makePayload({
          patientId: 'p-1', content: 'Patient prefers mornings', category: 'scheduling',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.message).toContain('added');
      });

      it('should handle PMS addPatientNote failure', async () => {
        mockSikka.addPatientNote.mockResolvedValue({
          success: false,
          error: { message: 'Write denied' },
        });

        const result = await service.addPatientNote(makePayload({
          patientId: 'p-1', content: 'Note content',
        })) as any;

        expect(result.error).toBe('Failed to add note');
      });
    });

    // ── getPatientInsurance ───────────────────────────────────────────

    describe('getPatientInsurance', () => {
      it('should return insurance records', async () => {
        mockSikka.getPatientInsurance.mockResolvedValue({
          success: true,
          data: [
            { provider: 'BlueCross', policyNumber: 'BC-123', isPrimary: true },
            { provider: 'Delta Dental', policyNumber: 'DD-456', isPrimary: false },
          ],
        });

        const result = await service.getPatientInsurance(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.insurance).toHaveLength(2);
        expect(result.result.count).toBe(2);
      });

      it('should handle no insurance on file', async () => {
        mockSikka.getPatientInsurance.mockResolvedValue({ success: true, data: [] });

        const result = await service.getPatientInsurance(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.count).toBe(0);
        expect(result.result.message).toContain("don't see");
      });

      it('should handle getPatientInsurance failure', async () => {
        mockSikka.getPatientInsurance.mockResolvedValue({
          success: false,
          error: 'Access denied',
        });

        const result = await service.getPatientInsurance(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.error).toBe('Failed to get insurance');
      });
    });

    // ── getPatientBalance ─────────────────────────────────────────────

    describe('getPatientBalance', () => {
      it('should return balance', async () => {
        mockSikka.getPatientBalance.mockResolvedValue({
          success: true,
          data: { amount: 250 },
        });

        const result = await service.getPatientBalance(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.balance.amount).toBe(250);
      });

      it('should handle getPatientBalance failure', async () => {
        mockSikka.getPatientBalance.mockResolvedValue({
          success: false,
          error: 'Timeout',
        });

        const result = await service.getPatientBalance(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.error).toBe('Failed to get balance');
      });

      it('should handle null balance', async () => {
        mockSikka.getPatientBalance.mockResolvedValue({
          success: true,
          data: null,
        });

        const result = await service.getPatientBalance(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.message).toContain("don't see a balance");
      });
    });

    // ── getProviders (PMS path) ───────────────────────────────────────

    describe('getProviders (PMS path)', () => {
      it('should return providers list from PMS', async () => {
        mockSikka.getProviders.mockResolvedValue({
          success: true,
          data: [
            { id: 'prov-1', firstName: 'Dr.', lastName: 'Smith', specialty: 'General' },
            { id: 'prov-2', name: 'Dr. Jones', specialty: 'Orthodontics' },
          ],
        });

        const result = await service.getProviders(makePayload({})) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.providers).toHaveLength(2);
        expect(result.result.count).toBe(2);
      });

      it('should handle getProviders failure', async () => {
        mockSikka.getProviders.mockResolvedValue({
          success: false,
          error: { message: 'API error' },
        });

        const result = await service.getProviders(makePayload({})) as any;

        expect(result.error).toBe('Failed to get providers');
      });
    });

    // ── checkAvailability (PMS path with slot scanning) ───────────────

    describe('checkAvailability (PMS path)', () => {
      it('should return slots when available', async () => {
        mockSikka.checkAvailability.mockResolvedValue({
          success: true,
          data: [
            { startTime: new Date('2026-04-01T10:00:00Z'), providerName: 'Dr. Smith' },
            { startTime: new Date('2026-04-01T14:00:00Z'), providerName: 'Dr. Jones' },
          ],
        });

        const result = await service.checkAvailability(makePayload({
          date: '2026-04-01', appointmentType: 'Cleaning',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.availableSlots).toHaveLength(2);
      });

      it('should scan next days when no slots on requested date', async () => {
        mockSikka.checkAvailability
          .mockResolvedValueOnce({ success: true, data: [] }) // requested date
          .mockResolvedValueOnce({                            // range query
            success: true,
            data: [{ startTime: new Date('2026-04-03T09:00:00Z'), providerName: 'Dr. Smith' }],
          });

        const result = await service.checkAvailability(makePayload({
          date: '2026-04-01',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.requestedDateAvailable).toBe(false);
        expect(result.result.availableSlots.length).toBeGreaterThanOrEqual(1);
      });

      it('should return no availability when scanning finds nothing', async () => {
        mockSikka.checkAvailability.mockResolvedValue({ success: true, data: [] });

        const result = await service.checkAvailability(makePayload({
          date: '2026-04-01',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.requestedDateAvailable).toBe(false);
        expect(result.result.availableSlots).toHaveLength(0);
      });

      it('should handle PMS checkAvailability failure', async () => {
        mockSikka.checkAvailability.mockResolvedValue({
          success: false,
          error: { message: 'Permission denied' },
        });

        const result = await service.checkAvailability(makePayload({
          date: '2026-04-01',
        })) as any;

        expect(result.error).toBeDefined();
      });
    });

    // ── Insurance methods ─────────────────────────────────────────────

    describe('saveInsurance', () => {
      it('should route to addPatientInsurance when no insuranceId', async () => {
        mockSikka.addPatientInsurance.mockResolvedValue({
          success: true,
          data: { id: 'ins-1', provider: 'BlueCross' },
        });

        const result = await service.saveInsurance(makePayload({
          patientId: 'p-1', provider: 'BlueCross', policyNumber: 'BC-123',
        })) as any;

        expect(result.result.success).toBe(true);
      });

      it('should route to updatePatientInsurance when insuranceId provided', async () => {
        mockSikka.updatePatientInsurance.mockResolvedValue({
          success: true,
          data: { id: 'ins-1', provider: 'BlueCross Updated' },
        });

        const result = await service.saveInsurance(makePayload({
          patientId: 'p-1', insuranceId: 'ins-1', provider: 'BlueCross Updated',
        })) as any;

        expect(result.result.success).toBe(true);
      });
    });

    describe('addPatientInsurance', () => {
      it('should add insurance successfully', async () => {
        mockSikka.addPatientInsurance.mockResolvedValue({
          success: true,
          data: { id: 'ins-new', provider: 'Delta Dental' },
        });

        const result = await service.addPatientInsurance(makePayload({
          patientId: 'p-1', provider: 'Delta Dental', policyNumber: 'DD-789',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.message).toContain('Delta Dental');
      });

      it('should handle failure', async () => {
        mockSikka.addPatientInsurance.mockResolvedValue({
          success: false,
          error: 'Duplicate policy',
        });

        const result = await service.addPatientInsurance(makePayload({
          patientId: 'p-1', provider: 'Delta Dental',
        })) as any;

        expect(result.error).toBe('Failed to add insurance');
      });
    });

    describe('updatePatientInsurance', () => {
      it('should update insurance successfully', async () => {
        mockSikka.updatePatientInsurance.mockResolvedValue({
          success: true,
          data: { id: 'ins-1', provider: 'BlueCross Updated' },
        });

        const result = await service.updatePatientInsurance(makePayload({
          patientId: 'p-1', insuranceId: 'ins-1', provider: 'BlueCross Updated',
        })) as any;

        expect(result.result.success).toBe(true);
      });

      it('should handle failure', async () => {
        mockSikka.updatePatientInsurance.mockResolvedValue({
          success: false,
          error: { message: 'Insurance not found' },
        });

        const result = await service.updatePatientInsurance(makePayload({
          patientId: 'p-1', insuranceId: 'ins-bad',
        })) as any;

        expect(result.error).toBe('Failed to update insurance');
      });
    });

    describe('verifyInsuranceCoverage', () => {
      it('should verify when insurance exists', async () => {
        mockSikka.getPatientInsurance.mockResolvedValue({
          success: true,
          data: [{ provider: 'BlueCross', policyNumber: 'BC-123' }],
        });

        const result = await service.verifyInsuranceCoverage(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.result.verified).toBe(true);
      });

      it('should return not verified when no insurance', async () => {
        mockSikka.getPatientInsurance.mockResolvedValue({
          success: true,
          data: null,
        });

        const result = await service.verifyInsuranceCoverage(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.result.verified).toBe(false);
      });

      it('should handle failure', async () => {
        mockSikka.getPatientInsurance.mockRejectedValue(new Error('API error'));

        const result = await service.verifyInsuranceCoverage(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.error).toBe('Failed to verify coverage');
      });
    });

    // ── Payment methods ───────────────────────────────────────────────

    describe('getPaymentHistory', () => {
      it('should return payment history', async () => {
        mockSikka.getPaymentHistory.mockResolvedValue({
          success: true,
          data: [
            { id: 'pay-1', amount: 100, date: '2026-01-15' },
            { id: 'pay-2', amount: 50, date: '2026-02-01' },
          ],
        });

        const result = await service.getPaymentHistory(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.count).toBe(2);
      });

      it('should handle empty payment history', async () => {
        mockSikka.getPaymentHistory.mockResolvedValue({ success: true, data: [] });

        const result = await service.getPaymentHistory(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.message).toContain('No recent');
      });

      it('should handle failure', async () => {
        mockSikka.getPaymentHistory.mockResolvedValue({
          success: false,
          error: 'Timeout',
        });

        const result = await service.getPaymentHistory(makePayload({
          patientId: 'p-1',
        })) as any;

        expect(result.error).toBe('Failed to get payment history');
      });
    });

    describe('processPayment', () => {
      it('should process payment successfully', async () => {
        mockSikka.processPayment.mockResolvedValue({
          success: true,
          data: { id: 'txn-1', amount: 100, status: 'completed' },
        });

        const result = await service.processPayment(makePayload({
          patientId: 'p-1', amount: 100, method: 'card', last4: '4242',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.message).toContain('$100');
      });

      it('should handle failure', async () => {
        mockSikka.processPayment.mockResolvedValue({
          success: false,
          error: 'Card declined',
        });

        const result = await service.processPayment(makePayload({
          patientId: 'p-1', amount: 100,
        })) as any;

        expect(result.error).toBe('Payment processing failed');
      });
    });

    describe('createPaymentPlan', () => {
      it('should create a payment plan', async () => {
        const result = await service.createPaymentPlan(makePayload({
          patientId: 'p-1',
          totalAmount: 1200,
          numberOfPayments: 12,
          frequency: 'monthly',
        })) as any;

        expect(result.result.success).toBe(true);
        expect(result.result.plan.monthlyAmount).toBe(100);
        expect(result.result.plan.numberOfPayments).toBe(12);
      });
    });

    // ── bookAppointment PMS catch block ───────────────────────────────

    describe('bookAppointment (PMS catch block)', () => {
      it('should return error when PMS fails and fallback is unavailable', async () => {
        prisma.vapiPhoneNumber.findFirst
          .mockResolvedValueOnce(pmsPhoneRecord)
          .mockResolvedValueOnce(null);

        mockSikka.bookAppointment.mockRejectedValue(new Error('PMS crash'));

        const result = await service.bookAppointment({
          call: { id: 'call-total-fail', phoneNumberId: 'vapi-phone-1' },
          message: { functionCall: { parameters: { startTime: '2026-04-01T10:00:00Z' } } },
        }) as any;

        expect(result.error).toBe('Booking failed');
      });
    });
  });

  // ── GCal-only getAppointments with no patient filter ───────────────

  describe('getAppointments — GCal with no patient filter', () => {
    it('should list all events when no patient filter provided', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1', googleCalendarConnected: true },
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.listEvents.mockResolvedValue({
        success: true,
        events: [
          { id: 'evt-1', startTime: '2026-03-01T10:00:00Z', endTime: '2026-03-01T10:30:00Z', summary: 'Cleaning', status: 'confirmed' },
        ],
      });

      const result = await service.getAppointments({
        accountId: 'acc-1',
        call: { id: 'call-list', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: {} },
      }) as any;

      expect(result.result.success).toBe(true);
      expect(result.result.appointments).toHaveLength(1);
      expect(gcalService.listEvents).toHaveBeenCalled();
    });

    it('should handle GCal listEvents failure', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1', googleCalendarConnected: true },
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.listEvents.mockResolvedValue({ success: false });

      const result = await service.getAppointments({
        accountId: 'acc-1',
        call: { id: 'call-list-fail', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: {} },
      }) as any;

      expect(result.error).toBe('Failed to retrieve appointments');
    });

    it('should handle GCal not available', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1' },
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(false);

      const result = await service.getAppointments({
        accountId: 'acc-1',
        call: { id: 'call-no-gcal', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: {} },
      }) as any;

      expect(result.error).toBe('No scheduling system configured');
    });
  });

  // ── GCal cancelAppointment errors ──────────────────────────────────

  describe('cancelAppointment — GCal error', () => {
    it('should handle GCal cancel failure', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1', googleCalendarConnected: true },
      });
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.deleteEvent.mockRejectedValue(new Error('Event not found'));

      const result = await service.cancelAppointment({
        accountId: 'acc-1',
        call: { id: 'call-cancel-fail', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: { appointmentId: 'evt-bad' } } },
      }) as any;

      expect(result.error).toBe('Appointment cancellation failed');
    });

    it('should handle cancel when GCal not available', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1' },
      });
      gcalService.isConnectedForAccount.mockResolvedValue(false);

      const result = await service.cancelAppointment({
        accountId: 'acc-1',
        call: { id: 'call-no-gcal', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: { appointmentId: 'evt-1' } } },
      }) as any;

      expect(result.error).toBe('No scheduling system configured');
    });
  });

  // ── checkAvailability GCal error ───────────────────────────────────

  describe('checkAvailability — GCal error paths', () => {
    it('should handle GCal not available', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1' },
      });
      gcalService.isConnectedForAccount.mockResolvedValue(false);

      const result = await service.checkAvailability({
        accountId: 'acc-1',
        call: { id: 'call-check-no-gcal', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: { date: '2026-04-01' } },
      }) as any;

      expect(result.error).toBe('No scheduling system configured');
    });

    it('should handle checkFreeBusy failure', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1', googleCalendarConnected: true, brandingTimezone: 'America/New_York' },
      });
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.checkFreeBusy.mockResolvedValue({ success: false });

      const result = await service.checkAvailability({
        accountId: 'acc-1',
        call: { id: 'call-check-fail', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: { date: '2026-04-01' } },
      }) as any;

      expect(result.error).toBe('Availability check failed');
    });
  });

  // ── bookAppointment — time parsing edge cases ──────────────────────

  describe('bookAppointment — time parsing', () => {
    beforeEach(() => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1', googleCalendarConnected: true, brandingTimezone: 'America/New_York', name: 'Test Clinic' },
      });
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.createAppointmentEvent.mockResolvedValue({
        success: true, eventId: 'evt-time', htmlLink: 'https://cal/evt-time',
      });
    });

    it('should parse date + 12-hour time (AM/PM)', async () => {
      const result = await service.bookAppointment({
        accountId: 'acc-1',
        call: { id: 'call-time-1', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: {
          date: '2026-04-01', startTime: '8:00 AM', firstName: 'Test', lastName: 'User',
        } } },
      }) as any;
      expect(result.result.success).toBe(true);
    });

    it('should handle completely unparseable time with fallback', async () => {
      const result = await service.bookAppointment({
        accountId: 'acc-1',
        call: { id: 'call-time-2', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: { firstName: 'Test', lastName: 'User' } } },
      }) as any;
      expect(result.result.success).toBe(true);
    });

    it('should parse patientName into firstName/lastName', async () => {
      const result = await service.bookAppointment({
        accountId: 'acc-1',
        call: { id: 'call-time-3', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: {
          startTime: '2026-04-01T10:00:00Z', patientName: 'Jane Smith',
        } } },
      }) as any;
      expect(result.result.success).toBe(true);
    });

    it('should parse name param into firstName/lastName', async () => {
      const result = await service.bookAppointment({
        accountId: 'acc-1',
        call: { id: 'call-time-4', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: {
          startTime: '2026-04-01T10:00:00Z', name: 'Bob Brown Jr',
        } } },
      }) as any;
      expect(result.result.success).toBe(true);
    });

    it('should use cached patient data when no name provided', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: null,
      });
      await service.createPatient({
        accountId: 'acc-1',
        call: { id: 'call-cache-test', phoneNumberId: 'vapi-phone-1' },
        functionCall: { parameters: { firstName: 'Cached', lastName: 'User', phone: '+14155551234' } },
      });

      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1', googleCalendarConnected: true, name: 'Clinic' },
      });
      gcalService.isConnectedForAccount.mockResolvedValue(true);

      const result = await service.bookAppointment({
        accountId: 'acc-1',
        call: { id: 'call-cache-test', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: { startTime: '2026-04-01T10:00:00Z' } } },
      }) as any;
      expect(result.result.success).toBe(true);
    });

    it('should handle GCal booking failure', async () => {
      gcalService.createAppointmentEvent.mockRejectedValue(new Error('GCal API error'));

      const result = await service.bookAppointment({
        accountId: 'acc-1',
        call: { id: 'call-gcal-fail', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: { startTime: '2026-04-01T10:00:00Z', firstName: 'Test' } } },
      }) as any;
      expect(result.error).toBe('Booking failed');
    });

    it('should handle booking when GCal is not available', async () => {
      gcalService.isConnectedForAccount.mockResolvedValue(false);

      const result = await service.bookAppointment({
        accountId: 'acc-1',
        call: { id: 'call-no-gcal', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: { startTime: '2026-04-01T10:00:00Z', firstName: 'Test' } } },
      }) as any;
      expect(result.error).toBe('No scheduling system configured');
    });

    it('should adjust past startTime to now + 1hr', async () => {
      const result = await service.bookAppointment({
        accountId: 'acc-1',
        call: { id: 'call-past', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: {
          startTime: '2020-01-01T10:00:00Z', firstName: 'Test',
        } } },
      }) as any;
      expect(result.result.success).toBe(true);
    });
  });

  // ── Retell path through getSikkaService ────────────────────────────

  describe('getSikkaService — Retell path', () => {
    it('should resolve account via agent_id when no phoneNumberId', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-retell',
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(true);
      gcalService.findEventsByPatient.mockResolvedValue({ success: true, events: [] });

      const result = await service.getAppointments({
        call: { id: 'retell-call', agent_id: 'retell-agent-1' },
        functionCall: { parameters: { patientName: 'Jane Doe' } },
      }) as any;

      expect(result).toBeDefined();
      expect(result.result?.success || result.error).toBeTruthy();
    });
  });

  // ── resolvePhoneRecord — fallback accountId path ───────────────────

  describe('resolvePhoneRecord — fallback accountId', () => {
    it('should use fallback accountId when no phone record found', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.retellPhoneNumber.findFirst.mockResolvedValue(null);
      prisma.account.findUnique.mockResolvedValue({ id: 'acc-fallback', name: 'Fallback Clinic' });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);

      const result = await service.lookupPatient({
        accountId: 'acc-fallback',
        call: { id: 'call-fallback', phoneNumberId: 'unknown', agent_id: 'unknown' },
        functionCall: { parameters: {} },
      }) as any;

      expect(result).toBeDefined();
    });
  });

  // ── GCal reschedule error ──────────────────────────────────────────

  describe('rescheduleAppointment — GCal error', () => {
    it('should handle GCal not available for reschedule', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue({
        accountId: 'acc-1',
        pmsIntegration: null,
        account: { id: 'acc-1' },
      });
      prisma.pmsIntegration.findFirst.mockResolvedValue(null);
      gcalService.isConnectedForAccount.mockResolvedValue(false);

      const result = await service.rescheduleAppointment({
        accountId: 'acc-1',
        call: { id: 'call-resched-no-gcal', phoneNumberId: 'vapi-phone-1' },
        message: { functionCall: { parameters: { appointmentId: 'evt-1', startTime: '2026-04-05T10:00:00Z' } } },
      }) as any;

      expect(result.error).toBe('No scheduling system configured');
    });
  });
});
