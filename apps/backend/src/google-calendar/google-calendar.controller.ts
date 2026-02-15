import { Controller, Post, Body, Param, Delete, Patch, Logger } from '@nestjs/common';
import { GoogleCalendarService } from './google-calendar.service';

interface PatientInfo {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
}

interface AppointmentDetails {
  appointmentType: string;
  startTime: Date;
  duration: number;
  notes?: string;
  providerId?: string;
}

@Controller('google-calendar')
export class GoogleCalendarController {
  private readonly logger = new Logger(GoogleCalendarController.name);

  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  /**
   * Create an appointment event in Google Calendar
   * Used for booking appointments when no PMS is connected
   */
  @Post('appointments')
  async createAppointment(
    @Body()
    body: {
      accountId: string;
      patient: PatientInfo;
      appointment: AppointmentDetails;
      vapiCallId?: string;
    },
  ) {
    try {
      this.logger.log({
        accountId: body.accountId,
        patientName: `${body.patient.firstName} ${body.patient.lastName}`,
        appointmentType: body.appointment.appointmentType,
        vapiCallId: body.vapiCallId,
        msg: 'Creating appointment in Google Calendar',
      });

      const result = await this.googleCalendarService.createAppointmentEvent(
        body.accountId,
        {
          patient: body.patient,
          ...body.appointment,
          startTime: new Date(body.appointment.startTime),
        },
      );

      return result;
    } catch (error) {
      this.logger.error({
        accountId: body.accountId,
        error: error.message,
        msg: 'Failed to create appointment in Google Calendar',
      });
      
      throw error;
    }
  }

  /**
   * Update an appointment event in Google Calendar
   */
  @Patch('appointments/:eventId')
  async updateAppointment(
    @Param('eventId') eventId: string,
    @Body()
    body: {
      accountId: string;
      updates: {
        startTime?: Date;
        duration?: number;
        notes?: string;
      };
    },
  ) {
    try {
      this.logger.log({
        accountId: body.accountId,
        eventId,
        msg: 'Updating appointment in Google Calendar',
      });

      // Calculate new end time if start time or duration changed
      let endTime: Date | undefined;
      if (body.updates.startTime && body.updates.duration) {
        endTime = new Date(body.updates.startTime);
        endTime.setMinutes(endTime.getMinutes() + body.updates.duration);
      }

      const result = await this.googleCalendarService.updateEvent(
        body.accountId,
        eventId,
        {
          start: body.updates.startTime,
          end: endTime,
          description: body.updates.notes,
        },
      );

      return result;
    } catch (error) {
      this.logger.error({
        accountId: body.accountId,
        eventId,
        error: error.message,
        msg: 'Failed to update appointment in Google Calendar',
      });
      
      throw error;
    }
  }

  /**
   * Cancel an appointment event in Google Calendar
   */
  @Delete('appointments/:eventId')
  async cancelAppointment(
    @Param('eventId') eventId: string,
    @Body()
    body: {
      accountId: string;
      reason?: string;
    },
  ) {
    try {
      this.logger.log({
        accountId: body.accountId,
        eventId,
        reason: body.reason,
        msg: 'Cancelling appointment in Google Calendar',
      });

      const result = await this.googleCalendarService.deleteEvent(
        body.accountId,
        eventId,
      );

      return result;
    } catch (error) {
      this.logger.error({
        accountId: body.accountId,
        eventId,
        error: error.message,
        msg: 'Failed to cancel appointment in Google Calendar',
      });
      
      throw error;
    }
  }
}
