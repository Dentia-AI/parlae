import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioMessagingService } from '../twilio/twilio-messaging.service';

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

interface ClinicInfo {
  accountId: string; // Added for branding lookup
  name: string;
  phone?: string;
  email?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilioService: TwilioMessagingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send appointment confirmation to patient and clinic
   */
  async sendAppointmentConfirmation(params: {
    accountId: string;
    patient: PatientInfo;
    appointment: AppointmentInfo;
    integrationType: 'pms' | 'google_calendar';
  }): Promise<{ emailSent: boolean; smsSent: boolean }> {
    const { accountId, patient, appointment, integrationType } = params;

    this.logger.log({
      accountId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      appointmentType: appointment.appointmentType,
      startTime: appointment.startTime,
      msg: 'Sending appointment confirmation',
    });

    // Get account details
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        name: true,
        email: true,
        twilioMessagingServiceSid: true,
      },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const clinic: ClinicInfo = {
      accountId,
      name: account.name,
      email: account.email,
    };

    // Format appointment time
    const appointmentTime = this.formatAppointmentTime(appointment.startTime);

    let emailSent = false;
    let smsSent = false;

    // Send SMS to patient
    if (patient.phone && account.twilioMessagingServiceSid) {
      try {
        const smsMessage = this.generateConfirmationSMS(
          patient,
          appointment,
          clinic,
        );
        await this.twilioService.sendSms({
          messagingServiceSid: account.twilioMessagingServiceSid,
          to: patient.phone,
          body: smsMessage,
        });
        smsSent = true;
        this.logger.log({
          accountId,
          to: patient.phone,
          msg: 'SMS confirmation sent to patient',
        });
      } catch (error) {
        this.logger.error({
          accountId,
          to: patient.phone,
          error: error.message,
          msg: 'Failed to send SMS to patient',
        });
      }
    }

    // Send email to patient
    if (patient.email) {
      try {
        await this.sendConfirmationEmail(
          patient.email,
          patient,
          appointment,
          clinic,
        );
        emailSent = true;
        this.logger.log({
          accountId,
          to: patient.email,
          msg: 'Email confirmation sent to patient',
        });
      } catch (error) {
        this.logger.error({
          accountId,
          to: patient.email,
          error: error.message,
          msg: 'Failed to send email to patient',
        });
      }
    }

    // Send notification to clinic
    if (clinic.email) {
      try {
        await this.sendClinicNotification(
          clinic.email,
          patient,
          appointment,
          'booking',
        );
        this.logger.log({
          accountId,
          to: clinic.email,
          msg: 'Notification sent to clinic',
        });
      } catch (error) {
        this.logger.error({
          accountId,
          to: clinic.email,
          error: error.message,
          msg: 'Failed to send notification to clinic',
        });
      }
    }

    return { emailSent, smsSent };
  }

  /**
   * Send appointment cancellation notification
   */
  async sendAppointmentCancellation(params: {
    accountId: string;
    patient: PatientInfo;
    appointment: AppointmentInfo;
    reason?: string;
  }): Promise<{ emailSent: boolean; smsSent: boolean }> {
    const { accountId, patient, appointment, reason } = params;

    this.logger.log({
      accountId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      appointmentType: appointment.appointmentType,
      startTime: appointment.startTime,
      msg: 'Sending appointment cancellation',
    });

    // Get account details
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        name: true,
        email: true,
        twilioMessagingServiceSid: true,
      },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const clinic: ClinicInfo = {
      accountId,
      name: account.name,
      email: account.email,
    };

    let emailSent = false;
    let smsSent = false;

    // Send SMS to patient
    if (patient.phone && account.twilioMessagingServiceSid) {
      try {
        const smsMessage = this.generateCancellationSMS(
          patient,
          appointment,
          clinic,
          reason,
        );
        await this.twilioService.sendSms({
          messagingServiceSid: account.twilioMessagingServiceSid,
          to: patient.phone,
          body: smsMessage,
        });
        smsSent = true;
      } catch (error) {
        this.logger.error({
          accountId,
          error: error.message,
          msg: 'Failed to send cancellation SMS',
        });
      }
    }

    // Send email to patient
    if (patient.email) {
      try {
        await this.sendCancellationEmail(
          patient.email,
          patient,
          appointment,
          clinic,
          reason,
        );
        emailSent = true;
      } catch (error) {
        this.logger.error({
          accountId,
          error: error.message,
          msg: 'Failed to send cancellation email',
        });
      }
    }

    // Send notification to clinic
    if (clinic.email) {
      try {
        await this.sendClinicNotification(
          clinic.email,
          patient,
          appointment,
          'cancellation',
          reason,
        );
      } catch (error) {
        this.logger.error({
          accountId,
          error: error.message,
          msg: 'Failed to send clinic notification',
        });
      }
    }

    return { emailSent, smsSent };
  }

  /**
   * Send appointment reschedule notification
   */
  async sendAppointmentReschedule(params: {
    accountId: string;
    patient: PatientInfo;
    oldAppointment: AppointmentInfo;
    newAppointment: AppointmentInfo;
  }): Promise<{ emailSent: boolean; smsSent: boolean }> {
    const { accountId, patient, oldAppointment, newAppointment } = params;

    this.logger.log({
      accountId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      oldTime: oldAppointment.startTime,
      newTime: newAppointment.startTime,
      msg: 'Sending appointment reschedule notification',
    });

    // Get account details
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        name: true,
        email: true,
        twilioMessagingServiceSid: true,
      },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const clinic: ClinicInfo = {
      accountId,
      name: account.name,
      email: account.email,
    };

    let emailSent = false;
    let smsSent = false;

    // Send SMS to patient
    if (patient.phone && account.twilioMessagingServiceSid) {
      try {
        const smsMessage = this.generateRescheduleSMS(
          patient,
          oldAppointment,
          newAppointment,
          clinic,
        );
        await this.twilioService.sendSms({
          messagingServiceSid: account.twilioMessagingServiceSid,
          to: patient.phone,
          body: smsMessage,
        });
        smsSent = true;
      } catch (error) {
        this.logger.error({
          accountId,
          error: error.message,
          msg: 'Failed to send reschedule SMS',
        });
      }
    }

    // Send email to patient
    if (patient.email) {
      try {
        await this.sendRescheduleEmail(
          patient.email,
          patient,
          oldAppointment,
          newAppointment,
          clinic,
        );
        emailSent = true;
      } catch (error) {
        this.logger.error({
          accountId,
          error: error.message,
          msg: 'Failed to send reschedule email',
        });
      }
    }

    // Send notification to clinic
    if (clinic.email) {
      try {
        await this.sendClinicRescheduleNotification(
          clinic.email,
          patient,
          oldAppointment,
          newAppointment,
        );
      } catch (error) {
        this.logger.error({
          accountId,
          error: error.message,
          msg: 'Failed to send clinic reschedule notification',
        });
      }
    }

    return { emailSent, smsSent };
  }

  // ============================================================================
  // SMS Message Generation
  // ============================================================================

  private generateConfirmationSMS(
    patient: PatientInfo,
    appointment: AppointmentInfo,
    clinic: ClinicInfo,
  ): string {
    const time = this.formatAppointmentTime(appointment.startTime);
    return `Hi ${patient.firstName}, your ${appointment.appointmentType} appointment at ${clinic.name} is confirmed for ${time}. Reply CANCEL to cancel or call us if you need to reschedule.`;
  }

  private generateCancellationSMS(
    patient: PatientInfo,
    appointment: AppointmentInfo,
    clinic: ClinicInfo,
    reason?: string,
  ): string {
    const time = this.formatAppointmentTime(appointment.startTime);
    const reasonText = reason ? ` Reason: ${reason}.` : '';
    return `Hi ${patient.firstName}, your ${appointment.appointmentType} appointment at ${clinic.name} on ${time} has been cancelled.${reasonText} Call us to reschedule.`;
  }

  private generateRescheduleSMS(
    patient: PatientInfo,
    oldAppointment: AppointmentInfo,
    newAppointment: AppointmentInfo,
    clinic: ClinicInfo,
  ): string {
    const newTime = this.formatAppointmentTime(newAppointment.startTime);
    return `Hi ${patient.firstName}, your appointment at ${clinic.name} has been rescheduled to ${newTime}. Reply CANCEL to cancel or call us for changes.`;
  }

  // ============================================================================
  // Email Sending (Using AWS SES with Templates)
  // ============================================================================

  private async sendConfirmationEmail(
    to: string,
    patient: PatientInfo,
    appointment: AppointmentInfo,
    clinic: ClinicInfo,
  ): Promise<void> {
    // Dynamically import mailer and templates
    const { getMailer } = await import('@kit/mailers');
    const { renderAppointmentConfirmationEmail } = await import('@kit/email-templates');
    
    const mailer = await getMailer();
    
    const time = this.formatAppointmentTime(appointment.startTime);
    const [date, timeStr] = time.split(' at ');
    
    // Get branding from account
    const account = await this.prisma.account.findUnique({
      where: { id: clinic.accountId },
      select: {
        brandingLogoUrl: true,
        brandingBusinessName: true,
        brandingPrimaryColor: true,
        brandingContactEmail: true,
        brandingContactPhone: true,
        brandingAddress: true,
        brandingWebsite: true,
      },
    });
    
    const { html, subject } = await renderAppointmentConfirmationEmail({
      patientName: `${patient.firstName} ${patient.lastName}`,
      clinicName: clinic.name,
      appointmentType: appointment.appointmentType,
      appointmentDate: date || time,
      appointmentTime: timeStr || '',
      duration: appointment.duration,
      notes: appointment.notes,
      eventLink: appointment.externalEventLink,
      branding: account ? {
        logoUrl: account.brandingLogoUrl || undefined,
        businessName: account.brandingBusinessName || undefined,
        primaryColor: account.brandingPrimaryColor || undefined,
        contactEmail: account.brandingContactEmail || clinic.email || undefined,
        contactPhone: account.brandingContactPhone || undefined,
        address: account.brandingAddress || undefined,
        website: account.brandingWebsite || undefined,
      } : undefined,
    });

    await mailer.sendEmail({
      to,
      from: process.env.EMAIL_FROM || 'support@parlae.ca',
      subject,
      html,
    });

    this.logger.log({
      to,
      subject,
      msg: 'Confirmation email sent successfully',
    });
  }

  private async sendCancellationEmail(
    to: string,
    patient: PatientInfo,
    appointment: AppointmentInfo,
    clinic: ClinicInfo,
    reason?: string,
  ): Promise<void> {
    const { getMailer } = await import('@kit/mailers');
    const { renderAppointmentCancellationEmail } = await import('@kit/email-templates');
    
    const mailer = await getMailer();
    
    const time = this.formatAppointmentTime(appointment.startTime);
    const [date, timeStr] = time.split(' at ');
    
    const account = await this.prisma.account.findUnique({
      where: { id: clinic.accountId },
      select: {
        brandingLogoUrl: true,
        brandingBusinessName: true,
        brandingPrimaryColor: true,
        brandingContactEmail: true,
        brandingContactPhone: true,
        brandingAddress: true,
        brandingWebsite: true,
      },
    });
    
    const { html, subject } = await renderAppointmentCancellationEmail({
      patientName: `${patient.firstName} ${patient.lastName}`,
      clinicName: clinic.name,
      appointmentType: appointment.appointmentType,
      appointmentDate: date || time,
      appointmentTime: timeStr || '',
      duration: appointment.duration,
      reason,
      branding: account ? {
        logoUrl: account.brandingLogoUrl || undefined,
        businessName: account.brandingBusinessName || undefined,
        primaryColor: account.brandingPrimaryColor || undefined,
        contactEmail: account.brandingContactEmail || clinic.email || undefined,
        contactPhone: account.brandingContactPhone || undefined,
        address: account.brandingAddress || undefined,
        website: account.brandingWebsite || undefined,
      } : undefined,
    });

    await mailer.sendEmail({
      to,
      from: process.env.EMAIL_FROM || 'support@parlae.ca',
      subject,
      html,
    });

    this.logger.log({
      to,
      subject,
      msg: 'Cancellation email sent successfully',
    });
  }

  private async sendRescheduleEmail(
    to: string,
    patient: PatientInfo,
    oldAppointment: AppointmentInfo,
    newAppointment: AppointmentInfo,
    clinic: ClinicInfo,
  ): Promise<void> {
    const { getMailer } = await import('@kit/mailers');
    const { renderAppointmentRescheduleEmail } = await import('@kit/email-templates');
    
    const mailer = await getMailer();
    
    const oldTime = this.formatAppointmentTime(oldAppointment.startTime);
    const newTime = this.formatAppointmentTime(newAppointment.startTime);
    const [oldDate, oldTimeStr] = oldTime.split(' at ');
    const [newDate, newTimeStr] = newTime.split(' at ');
    
    const account = await this.prisma.account.findUnique({
      where: { id: clinic.accountId },
      select: {
        brandingLogoUrl: true,
        brandingBusinessName: true,
        brandingPrimaryColor: true,
        brandingContactEmail: true,
        brandingContactPhone: true,
        brandingAddress: true,
        brandingWebsite: true,
      },
    });
    
    const { html, subject } = await renderAppointmentRescheduleEmail({
      patientName: `${patient.firstName} ${patient.lastName}`,
      clinicName: clinic.name,
      appointmentType: newAppointment.appointmentType,
      oldDate: oldDate || oldTime,
      oldTime: oldTimeStr || '',
      newDate: newDate || newTime,
      newTime: newTimeStr || '',
      duration: newAppointment.duration,
      notes: newAppointment.notes,
      eventLink: newAppointment.externalEventLink,
      branding: account ? {
        logoUrl: account.brandingLogoUrl || undefined,
        businessName: account.brandingBusinessName || undefined,
        primaryColor: account.brandingPrimaryColor || undefined,
        contactEmail: account.brandingContactEmail || clinic.email || undefined,
        contactPhone: account.brandingContactPhone || undefined,
        address: account.brandingAddress || undefined,
        website: account.brandingWebsite || undefined,
      } : undefined,
    });

    await mailer.sendEmail({
      to,
      from: process.env.EMAIL_FROM || 'support@parlae.ca',
      subject,
      html,
    });

    this.logger.log({
      to,
      subject,
      msg: 'Reschedule email sent successfully',
    });
  }

  private async sendClinicNotification(
    to: string,
    patient: PatientInfo,
    appointment: AppointmentInfo,
    type: 'booking' | 'cancellation',
    reason?: string,
  ): Promise<void> {
    // TODO: Implement with @kit/mailers
    this.logger.log({
      to,
      subject: `New Appointment ${type === 'booking' ? 'Booked' : 'Cancelled'} via AI`,
      msg: 'Would send clinic notification email (not implemented)',
    });
  }

  private async sendClinicRescheduleNotification(
    to: string,
    patient: PatientInfo,
    oldAppointment: AppointmentInfo,
    newAppointment: AppointmentInfo,
  ): Promise<void> {
    // TODO: Implement with @kit/mailers
    this.logger.log({
      to,
      subject: 'Appointment Rescheduled via AI',
      msg: 'Would send clinic reschedule notification (not implemented)',
    });
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  private formatAppointmentTime(date: Date): string {
    // Format: "Monday, February 20, 2026 at 2:00 PM"
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Toronto', // TODO: Make this configurable per account
    }).format(date);
  }
}
