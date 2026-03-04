import { Test, TestingModule } from '@nestjs/testing';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { DevAuthGuard } from '../auth/dev-auth.guard';
import { createMockGoogleCalendarService } from '../test/mocks/google-calendar.mock';

describe('GoogleCalendarController', () => {
  let controller: GoogleCalendarController;
  let calendarService: ReturnType<typeof createMockGoogleCalendarService>;

  beforeEach(async () => {
    calendarService = createMockGoogleCalendarService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoogleCalendarController],
      providers: [
        { provide: GoogleCalendarService, useValue: calendarService },
      ],
    })
      .overrideGuard(DevAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GoogleCalendarController>(GoogleCalendarController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── POST /appointments ────────────────────────────────────────────────

  describe('createAppointment', () => {
    const validBody = {
      accountId: 'acc-1',
      patient: {
        firstName: 'John',
        lastName: 'Doe',
        phone: '+14165551234',
        email: 'john@example.com',
        dateOfBirth: '1990-01-15',
      },
      appointment: {
        appointmentType: 'Cleaning',
        startTime: new Date('2026-03-10T14:00:00Z'),
        duration: 30,
        notes: 'First visit',
        providerId: 'dr-smith',
      },
      callId: 'call-abc',
    };

    it('should create an appointment and return the result', async () => {
      const result = await controller.createAppointment(validBody);

      expect(calendarService.createAppointmentEvent).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({
          patient: validBody.patient,
          appointmentType: 'Cleaning',
          duration: 30,
          notes: 'First visit',
          providerId: 'dr-smith',
          startTime: expect.any(Date),
        }),
      );
      expect(result).toEqual({
        success: true,
        eventId: 'appt_event_123',
        htmlLink: 'https://calendar.google.com/event/appt_123',
      });
    });

    it('should convert startTime string to Date before passing to service', async () => {
      const bodyWithStringDate = {
        ...validBody,
        appointment: {
          ...validBody.appointment,
          startTime: '2026-03-10T14:00:00Z' as unknown as Date,
        },
      };

      await controller.createAppointment(bodyWithStringDate);

      const call = calendarService.createAppointmentEvent.mock.calls[0];
      expect(call[1].startTime).toBeInstanceOf(Date);
    });

    it('should work without optional fields (callId, notes, providerId)', async () => {
      const minimalBody = {
        accountId: 'acc-1',
        patient: { firstName: 'Jane', lastName: 'Smith' },
        appointment: {
          appointmentType: 'Checkup',
          startTime: new Date('2026-03-11T09:00:00Z'),
          duration: 60,
        },
      };

      const result = await controller.createAppointment(minimalBody);
      expect(result.success).toBe(true);
      expect(calendarService.createAppointmentEvent).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({
          patient: { firstName: 'Jane', lastName: 'Smith' },
          appointmentType: 'Checkup',
          duration: 60,
        }),
      );
    });

    it('should rethrow service errors', async () => {
      calendarService.createAppointmentEvent.mockRejectedValue(
        new Error('Google Calendar not connected'),
      );

      await expect(controller.createAppointment(validBody)).rejects.toThrow(
        'Google Calendar not connected',
      );
    });

    it('should rethrow API errors', async () => {
      const apiError = new Error('Request failed with status 403');
      calendarService.createAppointmentEvent.mockRejectedValue(apiError);

      await expect(controller.createAppointment(validBody)).rejects.toThrow(
        'Request failed with status 403',
      );
    });
  });

  // ── PATCH /appointments/:eventId ──────────────────────────────────────

  describe('updateAppointment', () => {
    const baseBody = {
      accountId: 'acc-1',
      updates: {
        startTime: new Date('2026-03-10T15:00:00Z'),
        duration: 45,
        notes: 'Rescheduled by patient',
      },
    };

    it('should update an appointment with new time and notes', async () => {
      const result = await controller.updateAppointment('evt-123', baseBody);

      expect(calendarService.updateEvent).toHaveBeenCalledWith(
        'acc-1',
        'evt-123',
        expect.objectContaining({
          start: baseBody.updates.startTime,
          end: expect.any(Date),
          description: 'Rescheduled by patient',
        }),
      );
      expect(result).toEqual({
        success: true,
        eventId: 'event_123',
        htmlLink: 'https://calendar.google.com/event/123',
      });
    });

    it('should calculate endTime = startTime + duration', async () => {
      await controller.updateAppointment('evt-123', baseBody);

      const call = calendarService.updateEvent.mock.calls[0];
      const endTime: Date = call[2].end;
      const startTime: Date = call[2].start;
      const diffMinutes =
        (endTime.getTime() - startTime.getTime()) / (1000 * 60);
      expect(diffMinutes).toBe(45);
    });

    it('should pass undefined end when startTime or duration is missing', async () => {
      const notesOnlyBody = {
        accountId: 'acc-1',
        updates: { notes: 'Updated notes only' },
      };

      await controller.updateAppointment('evt-123', notesOnlyBody);

      const call = calendarService.updateEvent.mock.calls[0];
      expect(call[2].start).toBeUndefined();
      expect(call[2].end).toBeUndefined();
      expect(call[2].description).toBe('Updated notes only');
    });

    it('should not calculate endTime when only startTime is provided (no duration)', async () => {
      const startOnlyBody = {
        accountId: 'acc-1',
        updates: { startTime: new Date('2026-03-10T16:00:00Z') },
      };

      await controller.updateAppointment('evt-123', startOnlyBody);

      const call = calendarService.updateEvent.mock.calls[0];
      expect(call[2].start).toEqual(startOnlyBody.updates.startTime);
      expect(call[2].end).toBeUndefined();
    });

    it('should not calculate endTime when only duration is provided (no startTime)', async () => {
      const durationOnlyBody = {
        accountId: 'acc-1',
        updates: { duration: 60 },
      };

      await controller.updateAppointment('evt-123', durationOnlyBody);

      const call = calendarService.updateEvent.mock.calls[0];
      expect(call[2].start).toBeUndefined();
      expect(call[2].end).toBeUndefined();
    });

    it('should rethrow service errors', async () => {
      calendarService.updateEvent.mockRejectedValue(
        new Error('Event not found'),
      );

      await expect(
        controller.updateAppointment('evt-123', baseBody),
      ).rejects.toThrow('Event not found');
    });
  });

  // ── DELETE /appointments/:eventId ─────────────────────────────────────

  describe('cancelAppointment', () => {
    it('should cancel an appointment', async () => {
      const result = await controller.cancelAppointment('evt-456', {
        accountId: 'acc-1',
        reason: 'Patient no-show',
      });

      expect(calendarService.deleteEvent).toHaveBeenCalledWith(
        'acc-1',
        'evt-456',
      );
      expect(result).toEqual({ success: true });
    });

    it('should work without a reason', async () => {
      const result = await controller.cancelAppointment('evt-456', {
        accountId: 'acc-1',
      });

      expect(calendarService.deleteEvent).toHaveBeenCalledWith(
        'acc-1',
        'evt-456',
      );
      expect(result).toEqual({ success: true });
    });

    it('should rethrow service errors', async () => {
      calendarService.deleteEvent.mockRejectedValue(
        new Error('Calendar API rate limit'),
      );

      await expect(
        controller.cancelAppointment('evt-456', { accountId: 'acc-1' }),
      ).rejects.toThrow('Calendar API rate limit');
    });

    it('should rethrow when calendar is not connected', async () => {
      calendarService.deleteEvent.mockRejectedValue(
        new Error('Google Calendar not connected'),
      );

      await expect(
        controller.cancelAppointment('evt-456', { accountId: 'acc-1' }),
      ).rejects.toThrow('Google Calendar not connected');
    });
  });
});
