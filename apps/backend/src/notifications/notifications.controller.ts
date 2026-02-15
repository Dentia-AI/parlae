import { Controller, Post, Body, Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

interface PatientInfo {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
}

interface AppointmentInfo {
  appointmentType: string;
  startTime: Date;
  duration: number;
  notes?: string;
  externalEventLink?: string;
}

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Send appointment confirmation
   */
  @Post('appointment-confirmation')
  async sendAppointmentConfirmation(
    @Body()
    body: {
      accountId: string;
      patient: PatientInfo;
      appointment: AppointmentInfo;
      integrationType: 'pms' | 'google_calendar';
    },
  ) {
    try {
      const result = await this.notificationsService.sendAppointmentConfirmation({
        accountId: body.accountId,
        patient: body.patient,
        appointment: {
          ...body.appointment,
          startTime: new Date(body.appointment.startTime),
        },
        integrationType: body.integrationType,
      });

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error({
        accountId: body.accountId,
        error: error.message,
        msg: 'Failed to send appointment confirmation',
      });
      
      return {
        success: false,
        emailSent: false,
        smsSent: false,
        error: error.message,
      };
    }
  }

  /**
   * Send appointment cancellation notification
   */
  @Post('appointment-cancellation')
  async sendAppointmentCancellation(
    @Body()
    body: {
      accountId: string;
      patient: PatientInfo;
      appointment: AppointmentInfo;
      reason?: string;
    },
  ) {
    try {
      const result = await this.notificationsService.sendAppointmentCancellation({
        accountId: body.accountId,
        patient: body.patient,
        appointment: {
          ...body.appointment,
          startTime: new Date(body.appointment.startTime),
        },
        reason: body.reason,
      });

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error({
        accountId: body.accountId,
        error: error.message,
        msg: 'Failed to send appointment cancellation',
      });
      
      return {
        success: false,
        emailSent: false,
        smsSent: false,
        error: error.message,
      };
    }
  }

  /**
   * Send appointment reschedule notification
   */
  @Post('appointment-reschedule')
  async sendAppointmentReschedule(
    @Body()
    body: {
      accountId: string;
      patient: PatientInfo;
      oldAppointment: AppointmentInfo;
      newAppointment: AppointmentInfo;
    },
  ) {
    try {
      const result = await this.notificationsService.sendAppointmentReschedule({
        accountId: body.accountId,
        patient: body.patient,
        oldAppointment: {
          ...body.oldAppointment,
          startTime: new Date(body.oldAppointment.startTime),
        },
        newAppointment: {
          ...body.newAppointment,
          startTime: new Date(body.newAppointment.startTime),
        },
      });

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error({
        accountId: body.accountId,
        error: error.message,
        msg: 'Failed to send appointment reschedule notification',
      });
      
      return {
        success: false,
        emailSent: false,
        smsSent: false,
        error: error.message,
      };
    }
  }
}
