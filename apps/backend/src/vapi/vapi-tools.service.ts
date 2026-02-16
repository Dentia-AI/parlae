import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HipaaAuditService } from '../common/services/hipaa-audit.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import twilio from 'twilio';

@Injectable()
export class VapiToolsService {
  private readonly logger = new Logger(VapiToolsService.name);

  constructor(
    private prisma: PrismaService,
    private hipaaAudit: HipaaAuditService,
    private googleCalendar: GoogleCalendarService,
  ) {}

  async transferToHuman(payload: any) {
    try {
      const { call, message } = payload;

      this.logger.log({
        callId: call.id,
        phoneNumberId: call.phoneNumberId,
      });

      // Get clinic and phone configuration
      const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        include: { account: true },
      });

      if (!phoneRecord) {
        this.logger.error({ phoneNumberId: call.phoneNumberId });
        return {
          error: 'Configuration not found',
          message:
            "I apologize, but I'm unable to transfer you right now. Please call our main office line.",
        };
      }

      // Check if transfer is enabled
      // TODO: Add transferEnabled and staffForwardNumber to schema
      const transferEnabled = (phoneRecord as any).transferEnabled;
      const staffForwardNumber = (phoneRecord as any).staffForwardNumber;
      
      if (!transferEnabled || !staffForwardNumber) {
        this.logger.warn({
          clinicId: phoneRecord.accountId,
          transferEnabled,
        });
        return {
          error: 'Transfer not configured',
          message:
            "I apologize, but live assistance is not available right now. I can take a detailed message and have someone call you back within the hour.",
        };
      }

      // Get function call parameters
      const functionCall = message.functionCall;
      const reason = functionCall.parameters.reason || 'emergency';
      const summary =
        functionCall.parameters.summary || 'Patient requested transfer';
      const patientInfo = functionCall.parameters.patientInfo || {};

      // Log the transfer request
      // Call data is managed by Vapi — no local call log to update.
      // await this.prisma.callReference.findFirst({
      //   where: { vapiCallId: call.id },
      //     transferReason: reason,
      //     transferSummary: summary,
      //     updatedAt: new Date(),
      //   },
      // });

      // Alert staff via SMS
      if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
        const twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!,
        );

        await twilioClient.messages.create({
          messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
          to: staffForwardNumber,
          body: `URGENT: Call transfer incoming from ${phoneRecord.account?.name}\nReason: ${reason}\nSummary: ${summary}\nPatient: ${patientInfo.name || 'Unknown'}`,
        });
      }

      this.logger.log({
        clinicId: phoneRecord.accountId,
        transferTo: staffForwardNumber,
        reason,
      });

      return {
        result: {
          success: true,
          action: 'transfer',
          transferTo: staffForwardNumber,
          message: 'Transferring you to our staff now. Please hold.',
          summary,
          patientInfo,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Transfer failed',
        message:
          "I apologize, but I'm having trouble with the transfer. Let me take your information and have someone call you right back.",
      };
    }
  }

  async bookAppointment(payload: any) {
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      // Get phone record and PMS integration
      const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        include: { pmsIntegration: true, account: true },
      });

      if (!phoneRecord?.pmsIntegration) {
        // ── Google Calendar Fallback ──
        return this.bookAppointmentViaGoogleCalendar(phoneRecord, params, call);
      }

      // Get PMS service (credentials from env, never DB)
      const { PmsService } = await import('../pms/pms.service');
      const { SecretsService } = await import('../common/services/secrets.service');
      const secretsService = new SecretsService();
      const pmsService = new PmsService(this.prisma, secretsService);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      // Book appointment (using Sikka's bookAppointment method)
      // Params aligned with Sikka API: patientId, appointmentType, startTime (ISO 8601), duration (minutes)
      const result = await sikkaService.bookAppointment({
        patientId: params.patientId,
        providerId: params.providerId,
        appointmentType: params.appointmentType || params.type || 'General',
        startTime: new Date(params.startTime || params.datetime),
        duration: params.duration || 30,
        notes: params.notes,
      });
      
      if (!result.success || !result.data) {
        const errorMsg = result.error ? (typeof result.error === 'string' ? result.error : result.error.message) : 'Booking failed';
        throw new Error(errorMsg);
      }
      
      const appointment = result.data;

      this.logger.log({ appointmentId: appointment.id });

      return {
        result: {
          success: true,
          appointmentId: appointment.id,
          confirmationNumber: appointment.confirmationNumber,
          message: `Appointment booked for ${new Date(params.datetime).toLocaleString()}`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Booking failed',
        message: "I'm sorry, I had trouble booking that appointment. Let me take your information and have someone call you back.",
      };
    }
  }

  async checkAvailability(payload: any) {
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        include: { pmsIntegration: true, account: true },
      });

      if (!phoneRecord?.pmsIntegration) {
        // ── Google Calendar Fallback ──
        return this.checkAvailabilityViaGoogleCalendar(phoneRecord, params);
      }

      const { PmsService } = await import('../pms/pms.service');
      const { SecretsService } = await import('../common/services/secrets.service');
      const secretsService = new SecretsService();
      const pmsService = new PmsService(this.prisma, secretsService);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      // Params aligned with Sikka API: date (YYYY-MM-DD), appointmentType, duration (minutes), providerId
      const result = await sikkaService.checkAvailability({
        date: params.date,
        appointmentType: params.appointmentType || params.type,
        duration: params.duration || 30,
        providerId: params.providerId,
      });
      
      if (!result.success) {
        const errorMsg = result.error ? (typeof result.error === 'string' ? result.error : result.error.message) : 'Availability check failed';
        throw new Error(errorMsg);
      }
      
      const slots = result.data || [];

      return {
        result: {
          success: true,
          availableSlots: slots.map((slot) => ({
            time: slot.startTime,
            provider: slot.providerName,
          })),
          message: slots.length > 0 
            ? `We have ${slots.length} available slots on ${params.date}`
            : `No availability on ${params.date}. Let me check other dates.`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Availability check failed',
        message: "Let me transfer you to our scheduling team.",
      };
    }
  }

  async getPatientInfo(payload: any) {
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        include: { pmsIntegration: true },
      });

      if (!phoneRecord?.pmsIntegration) {
        return {
          error: 'PMS not configured',
          message: "Let me get your information manually.",
        };
      }

      const { PmsService } = await import('../pms/pms.service');
      const { SecretsService } = await import('../common/services/secrets.service');
      const secretsService = new SecretsService();
      const pmsService = new PmsService(this.prisma, secretsService);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      // Search by phone or name
      const searchQuery = params.phone || params.email || params.name || `${params.firstName || ''} ${params.lastName || ''}`.trim();
      const result = await sikkaService.searchPatients({
        query: searchQuery,
        limit: 5,
      });
      
      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMsg || 'Patient search failed');
      }
      
      const patients = result.data || [];

      if (patients.length === 0) {
        return {
          result: {
            success: false,
            message: "I don't see a record for you. Let me create a new patient profile.",
          },
        };
      }

      const patient = patients[0];
      // HIPAA AUDIT LOG
      await this.hipaaAudit.logAccess({
        pmsIntegrationId: phoneRecord.pmsIntegration.id,
        action: 'getPatientInfo',
        endpoint: '/patients/search',
        method: 'GET',
        vapiCallId: call.id,
        requestSummary: 'Retrieved patient information during call',
        responseStatus: 200,
        responseTime: 0, // TODO: Track actual time
        phiAccessed: true,
        phiFields: ['name', 'phone', 'email', 'dateOfBirth', 'lastVisit', 'balance'],
      });

      return {
        result: {
          success: true,
          patient: {
            id: patient.id,
            name: `${patient.firstName} ${patient.lastName}`,
            lastVisit: patient.lastVisit,
            balance: patient.balance,
          },
          message: `Welcome back, ${patient.firstName}! I see your last visit was on ${patient.lastVisit?.toLocaleDateString()}.`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Patient lookup failed',
        message: "Let me get your information manually.",
      };
    }
  }

  /**
   * Search for patients by name, phone, or email
   * Separate from getPatientInfo - returns multiple results
   */
  async searchPatients(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        include: { pmsIntegration: true },
      });

      if (!phoneRecord?.pmsIntegration) {
        return {
          error: 'PMS not configured',
          message: "Let me get your information manually.",
        };
      }

      const { PmsService } = await import('../pms/pms.service');
      const { SecretsService } = await import('../common/services/secrets.service');
      const secretsService = new SecretsService();
      const pmsService = new PmsService(this.prisma, secretsService);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      const result = await sikkaService.searchPatients({
        query: params.query || '',
        limit: params.limit || 10,
      });

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'searchPatients',
          endpoint: '/patients/search',
          method: 'GET',
          vapiCallId: call.id,
          requestSummary: `Searched patients: ${params.query}`,
          responseStatus: 500,
          responseTime,
          phiAccessed: false,
          errorMessage: errorMsg,
        });
        throw new Error(errorMsg || 'Patient search failed');
      }

      const patients = result.data || [];

      // HIPAA AUDIT LOG
      await this.hipaaAudit.logAccess({
        pmsIntegrationId: phoneRecord.pmsIntegration.id,
        action: 'searchPatients',
        endpoint: '/patients/search',
        method: 'GET',
        vapiCallId: call.id,
        requestSummary: `Searched patients, returned ${patients.length} results`,
        responseStatus: 200,
        responseTime,
        phiAccessed: patients.length > 0,
        phiFields: patients.length > 0 ? ['name', 'phone', 'dateOfBirth'] : [],
      });

      return {
        result: {
          success: true,
          patients: patients.map((p) => ({
            id: p.id,
            name: `${p.firstName} ${p.lastName}`,
            phone: p.phone,
            dateOfBirth: p.dateOfBirth,
          })),
          count: patients.length,
          message: patients.length > 0 
            ? `I found ${patients.length} patient(s) matching your search.`
            : "I didn't find any patients with that information.",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Patient search failed',
        message: "I'm having trouble searching our records. Let me take your information manually.",
      };
    }
  }

  /**
   * Create a new patient record
   */
  async createPatient(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        include: { pmsIntegration: true },
      });

      if (!phoneRecord?.pmsIntegration) {
        return {
          error: 'PMS not configured',
          message: "Let me take your information manually.",
        };
      }

      const { PmsService } = await import('../pms/pms.service');
      const { SecretsService } = await import('../common/services/secrets.service');
      const secretsService = new SecretsService();
      const pmsService = new PmsService(this.prisma, secretsService);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      // Use caller's phone from Vapi call metadata if not explicitly provided
      const callerPhone = call?.customer?.number;
      const patientPhone = params.phone || callerPhone;

      const result = await sikkaService.createPatient({
        firstName: params.firstName,
        lastName: params.lastName,
        phone: patientPhone,
        email: params.email,
        dateOfBirth: params.dateOfBirth,
        address: params.address,
        notes: params.notes,
      });

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'createPatient',
          endpoint: '/patients',
          method: 'POST',
          vapiCallId: call.id,
          requestSummary: `Attempted to create patient: ${params.firstName} ${params.lastName}`,
          responseStatus: 500,
          responseTime,
          phiAccessed: false,
          errorMessage: errorMsg,
        });
        throw new Error(errorMsg || 'Patient creation failed');
      }

      const patient = result.data!;

      // HIPAA AUDIT LOG
      await this.hipaaAudit.logAccess({
        pmsIntegrationId: phoneRecord.pmsIntegration.id,
        action: 'createPatient',
        endpoint: '/patients',
        method: 'POST',
        vapiCallId: call.id,
        requestSummary: `Created new patient record`,
        responseStatus: 201,
        responseTime,
        phiAccessed: true,
        phiFields: ['name', 'phone', 'email', 'dateOfBirth', 'address'],
      });

      return {
        result: {
          success: true,
          patient: {
            id: patient.id,
            name: `${patient.firstName} ${patient.lastName}`,
          },
          message: `Great! I've created your patient profile, ${patient.firstName}. You're all set.`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Patient creation failed',
        message: "I'm having trouble creating your profile. Let me transfer you to our front desk.",
      };
    }
  }

  /**
   * Update existing patient information
   */
  async updatePatient(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        include: { pmsIntegration: true },
      });

      if (!phoneRecord?.pmsIntegration) {
        return {
          error: 'PMS not configured',
          message: "Let me take your updated information manually.",
        };
      }

      const { PmsService } = await import('../pms/pms.service');
      const { SecretsService } = await import('../common/services/secrets.service');
      const secretsService = new SecretsService();
      const pmsService = new PmsService(this.prisma, secretsService);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      const updateData: any = {};
      if (params.phone) updateData.phone = params.phone;
      if (params.email) updateData.email = params.email;
      if (params.address) updateData.address = params.address;

      const result = await sikkaService.updatePatient(params.patientId, updateData);

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'updatePatient',
          endpoint: `/patients/${params.patientId}`,
          method: 'PUT',
          vapiCallId: call.id,
          requestSummary: `Attempted to update patient information`,
          responseStatus: 500,
          responseTime,
          phiAccessed: false,
          errorMessage: errorMsg,
        });
        throw new Error(errorMsg || 'Patient update failed');
      }

      // HIPAA AUDIT LOG
      await this.hipaaAudit.logAccess({
        pmsIntegrationId: phoneRecord.pmsIntegration.id,
        action: 'updatePatient',
        endpoint: `/patients/${params.patientId}`,
        method: 'PUT',
        vapiCallId: call.id,
        requestSummary: `Updated patient information`,
        responseStatus: 200,
        responseTime,
        phiAccessed: true,
        phiFields: Object.keys(updateData),
      });

      return {
        result: {
          success: true,
          message: "I've updated your information successfully.",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Patient update failed',
        message: "I'm having trouble updating your information. Let me transfer you to our front desk.",
      };
    }
  }

  /**
   * Cancel an existing appointment
   * Sikka API: DELETE /appointments/{appointmentId}
   * Params: { appointmentId, reason? }
   */
  async cancelAppointment(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        include: { pmsIntegration: true, account: true },
      });

      if (!phoneRecord?.pmsIntegration) {
        // ── Google Calendar Fallback ──
        return this.cancelAppointmentViaGoogleCalendar(phoneRecord, params);
      }

      const { PmsService } = await import('../pms/pms.service');
      const { SecretsService } = await import('../common/services/secrets.service');
      const secretsService = new SecretsService();
      const pmsService = new PmsService(this.prisma, secretsService);
      const sikkaService = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      const result = await sikkaService.cancelAppointment(
        params.appointmentId,
        { reason: params.reason || 'Patient requested cancellation' }
      );

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: phoneRecord.pmsIntegration.id,
          action: 'cancelAppointment',
          endpoint: `/appointments/${params.appointmentId}/cancel`,
          method: 'POST',
          vapiCallId: call.id,
          requestSummary: `Attempted to cancel appointment`,
          responseStatus: 500,
          responseTime,
          phiAccessed: false,
          errorMessage: errorMsg,
        });
        throw new Error(errorMsg || 'Appointment cancellation failed');
      }

      // HIPAA AUDIT LOG
      await this.hipaaAudit.logAccess({
        pmsIntegrationId: phoneRecord.pmsIntegration.id,
        action: 'cancelAppointment',
        endpoint: `/appointments/${params.appointmentId}/cancel`,
        method: 'POST',
        vapiCallId: call.id,
        requestSummary: `Cancelled appointment: ${params.reason || 'Patient requested'}`,
        responseStatus: 200,
        responseTime,
        phiAccessed: true,
        phiFields: ['appointmentId', 'patientId', 'dateTime'],
      });

      return {
        result: {
          success: true,
          message: "Your appointment has been cancelled successfully. Would you like to reschedule for another time?",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Appointment cancellation failed',
        message: "I'm having trouble cancelling your appointment. Let me transfer you to our scheduling team.",
      };
    }
  }

  // ============================================================================
  // New handlers - matching Sikka API methods
  // ============================================================================

  /**
   * Get a patient's appointments
   * Sikka API: GET /appointments?patientId=xxx
   * Params: { patientId, startDate?, endDate? }
   */
  async getAppointments(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      const sikkaService = await this.getSikkaService(call);
      if (!sikkaService.service) {
        // ── Google Calendar Fallback ──
        return this.getAppointmentsViaGoogleCalendar(call, params);
      }

      const today = new Date();
      const ninetyDaysOut = new Date(today);
      ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);

      const result = await sikkaService.service.getAppointments({
        patientId: params.patientId,
        startDate: params.startDate ? new Date(params.startDate) : today,
        endDate: params.endDate ? new Date(params.endDate) : ninetyDaysOut,
      });

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMsg || 'Failed to get appointments');
      }

      const appointments = result.data || [];

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'getAppointments',
        endpoint: '/appointments',
        method: 'GET',
        vapiCallId: call.id,
        requestSummary: `Retrieved ${appointments.length} appointments for patient`,
        responseStatus: 200,
        responseTime,
        phiAccessed: appointments.length > 0,
        phiFields: appointments.length > 0 ? ['appointmentId', 'date', 'time', 'type', 'provider'] : [],
      });

      return {
        result: {
          success: true,
          appointments: appointments.map((apt: any) => ({
            id: apt.id,
            date: apt.startTime,
            type: apt.appointmentType,
            provider: apt.providerName || apt.providerId,
            status: apt.status,
            duration: apt.duration,
          })),
          count: appointments.length,
          message: appointments.length > 0
            ? `I found ${appointments.length} upcoming appointment(s).`
            : "I don't see any upcoming appointments on your record.",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Failed to retrieve appointments',
        message: "I'm having trouble looking up your appointments. Can you tell me more about the appointment you're looking for?",
      };
    }
  }

  /**
   * Reschedule an existing appointment
   * Sikka API: PATCH /appointments/{appointmentId}
   * Params: { appointmentId, startTime (ISO 8601), duration?, providerId?, notes? }
   */
  async rescheduleAppointment(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      const sikkaService = await this.getSikkaService(call);
      if (!sikkaService.service) {
        // ── Google Calendar Fallback ──
        return this.rescheduleAppointmentViaGoogleCalendar(call, params);
      }

      const updates: any = {};
      if (params.startTime) updates.startTime = new Date(params.startTime);
      if (params.duration) updates.duration = params.duration;
      if (params.providerId) updates.providerId = params.providerId;
      if (params.notes) updates.notes = params.notes;

      const result = await sikkaService.service.rescheduleAppointment(
        params.appointmentId,
        updates,
      );

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        await this.hipaaAudit.logAccess({
          pmsIntegrationId: sikkaService.pmsIntegrationId,
          action: 'rescheduleAppointment',
          endpoint: `/appointments/${params.appointmentId}`,
          method: 'PATCH',
          vapiCallId: call.id,
          requestSummary: `Attempted to reschedule appointment`,
          responseStatus: 500,
          responseTime,
          phiAccessed: false,
          errorMessage: errorMsg,
        });
        throw new Error(errorMsg || 'Reschedule failed');
      }

      const appointment = result.data;

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'rescheduleAppointment',
        endpoint: `/appointments/${params.appointmentId}`,
        method: 'PATCH',
        vapiCallId: call.id,
        requestSummary: `Rescheduled appointment to ${params.startTime}`,
        responseStatus: 200,
        responseTime,
        phiAccessed: true,
        phiFields: ['appointmentId', 'startTime', 'duration', 'providerId'],
      });

      return {
        result: {
          success: true,
          appointment: appointment ? {
            id: appointment.id,
            date: appointment.startTime,
            type: appointment.appointmentType,
            provider: appointment.providerName,
          } : null,
          message: `Your appointment has been rescheduled to ${new Date(params.startTime).toLocaleString()}.`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Reschedule failed',
        message: "I'm having trouble rescheduling. Let me check availability for another time.",
      };
    }
  }

  /**
   * Add a note to a patient's record
   * Sikka API: POST /medical_notes
   * Params: { patientId, content, category? }
   */
  async addPatientNote(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      const sikkaService = await this.getSikkaService(call);
      if (!sikkaService.service) return sikkaService.error;

      const result = await sikkaService.service.addPatientNote(
        params.patientId,
        {
          content: params.content,
          category: params.category || 'general',
          createdBy: 'AI Agent',
        },
      );

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMsg || 'Failed to add note');
      }

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'addPatientNote',
        endpoint: '/medical_notes',
        method: 'POST',
        vapiCallId: call.id,
        requestSummary: `Added ${params.category || 'general'} note to patient record`,
        responseStatus: 201,
        responseTime,
        phiAccessed: true,
        phiFields: ['patientId', 'noteContent'],
      });

      return {
        result: {
          success: true,
          message: "I've added that note to your file.",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Failed to add note',
        message: "I'll make sure our team gets that information.",
      };
    }
  }

  /**
   * Get patient's insurance information
   * Sikka API: GET /patients/{patientId}/insurance
   * Params: { patientId }
   */
  async getPatientInsurance(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      const sikkaService = await this.getSikkaService(call);
      if (!sikkaService.service) return sikkaService.error;

      const result = await sikkaService.service.getPatientInsurance(params.patientId);

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMsg || 'Failed to get insurance');
      }

      const insuranceRecords = result.data || [];

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'getPatientInsurance',
        endpoint: `/patients/${params.patientId}/insurance`,
        method: 'GET',
        vapiCallId: call.id,
        requestSummary: `Retrieved insurance information`,
        responseStatus: 200,
        responseTime,
        phiAccessed: insuranceRecords.length > 0,
        phiFields: insuranceRecords.length > 0 ? ['insuranceProvider', 'policyNumber', 'groupNumber'] : [],
      });

      return {
        result: {
          success: true,
          insurance: insuranceRecords.map((ins: any) => ({
            provider: ins.provider,
            policyNumber: ins.policyNumber,
            isPrimary: ins.isPrimary,
          })),
          count: insuranceRecords.length,
          message: insuranceRecords.length > 0
            ? `I see ${insuranceRecords.length} insurance plan(s) on file.`
            : "I don't see any insurance information on your record.",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Failed to get insurance',
        message: "I'm having trouble accessing insurance records. Our billing team can help with that.",
      };
    }
  }

  /**
   * Get patient's account balance
   * Sikka API: GET /patient_balance?patient_id={patientId}
   * Params: { patientId }
   */
  async getPatientBalance(payload: any) {
    const startTime = Date.now();
    try {
      const { call, message } = payload;
      const params = message.functionCall.parameters;

      const sikkaService = await this.getSikkaService(call);
      if (!sikkaService.service) return sikkaService.error;

      const result = await sikkaService.service.getPatientBalance(params.patientId);

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMsg || 'Failed to get balance');
      }

      const balance = result.data;

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'getPatientBalance',
        endpoint: '/patient_balance',
        method: 'GET',
        vapiCallId: call.id,
        requestSummary: `Retrieved patient balance`,
        responseStatus: 200,
        responseTime,
        phiAccessed: true,
        phiFields: ['patientId', 'balance'],
      });

      return {
        result: {
          success: true,
          balance: balance,
          message: balance
            ? `Your current balance is $${(balance as any).amount || 0}.`
            : "I don't see a balance on your account.",
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Failed to get balance',
        message: "I'm unable to pull up balance information right now. Our billing team can help with that.",
      };
    }
  }

  /**
   * Get list of providers
   * Sikka API: GET /providers
   * Params: none
   */
  async getProviders(payload: any) {
    const startTime = Date.now();
    try {
      const { call } = payload;

      const sikkaService = await this.getSikkaService(call);
      if (!sikkaService.service) return sikkaService.error;

      const result = await sikkaService.service.getProviders();

      const responseTime = Date.now() - startTime;

      if (!result.success) {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message;
        throw new Error(errorMsg || 'Failed to get providers');
      }

      const providers = result.data || [];

      await this.hipaaAudit.logAccess({
        pmsIntegrationId: sikkaService.pmsIntegrationId,
        action: 'getProviders',
        endpoint: '/providers',
        method: 'GET',
        vapiCallId: call.id,
        requestSummary: `Retrieved ${providers.length} providers`,
        responseStatus: 200,
        responseTime,
        phiAccessed: false,
        phiFields: [],
      });

      return {
        result: {
          success: true,
          providers: providers.map((p: any) => ({
            id: p.id,
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.name,
            specialty: p.specialty,
          })),
          count: providers.length,
          message: `We have ${providers.length} provider(s) available.`,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        error: 'Failed to get providers',
        message: "I'm having trouble looking up our providers. Let me help you another way.",
      };
    }
  }

  // ============================================================================
  // Helper: Get Sikka service from Vapi call context
  // Eliminates repeated boilerplate across handlers
  // ============================================================================

  private async getSikkaService(call: any): Promise<{
    service: any;
    pmsIntegrationId: string;
    accountId?: string;
    error?: any;
  }> {
    try {
      const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
        where: { vapiPhoneId: call.phoneNumberId },
        include: { pmsIntegration: true },
      });

      if (!phoneRecord?.pmsIntegration) {
        return {
          service: null,
          pmsIntegrationId: '',
          accountId: phoneRecord?.accountId,
        };
      }

      const { PmsService } = await import('../pms/pms.service');
      const { SecretsService } = await import('../common/services/secrets.service');
      const secretsService = new SecretsService();
      const pmsService = new PmsService(this.prisma, secretsService);
      const service = await pmsService.getPmsService(
        phoneRecord.accountId,
        phoneRecord.pmsIntegration.provider,
        phoneRecord.pmsIntegration.config,
      );

      return {
        service,
        pmsIntegrationId: phoneRecord.pmsIntegration.id,
        accountId: phoneRecord.accountId,
      };
    } catch (error) {
      this.logger.error(error);
      return {
        service: null,
        pmsIntegrationId: '',
        error: {
          error: 'PMS connection failed',
          message: "I'm having trouble connecting to our system. Let me take your information and someone will follow up.",
        },
      };
    }
  }

  // ============================================================================
  // Google Calendar Fallback Methods
  // When PMS is not connected but Google Calendar is, use Calendar as fallback
  // ============================================================================

  /**
   * Helper: Get accountId from Vapi call context
   */
  private async getAccountIdFromCall(call: any): Promise<string | null> {
    const phoneRecord = await this.prisma.vapiPhoneNumber.findFirst({
      where: { vapiPhoneId: call.phoneNumberId },
      select: { accountId: true },
    });
    return phoneRecord?.accountId || null;
  }

  /**
   * Helper: Check if Google Calendar is available as fallback for an account
   */
  private async isGoogleCalendarAvailable(accountId: string | null | undefined): Promise<boolean> {
    if (!accountId) return false;
    if (!this.googleCalendar.isConfigured()) return false;
    return this.googleCalendar.isConnectedForAccount(accountId);
  }

  /**
   * Fallback: Book appointment via Google Calendar
   */
  private async bookAppointmentViaGoogleCalendar(
    phoneRecord: any,
    params: any,
    call: any,
  ) {
    const accountId = phoneRecord?.accountId;
    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);

    if (!gcAvailable) {
      return {
        error: 'No scheduling system configured',
        message:
          "I apologize, but appointment booking is not set up yet. Please call us directly to schedule.",
      };
    }

    this.logger.log({
      accountId,
      msg: '[GCal Fallback] Booking appointment via Google Calendar',
    });

    try {
      const callerPhone = call?.customer?.number;
      const startTime = new Date(params.startTime || params.datetime);
      const duration = params.duration || 30;

      const result = await this.googleCalendar.createAppointmentEvent(
        accountId,
        {
          patient: {
            firstName: params.firstName || params.patientName?.split(' ')[0] || 'Patient',
            lastName: params.lastName || params.patientName?.split(' ').slice(1).join(' ') || '',
            phone: params.phone || callerPhone,
            email: params.email,
            dateOfBirth: params.dateOfBirth,
          },
          appointmentType: params.appointmentType || params.type || 'General',
          startTime,
          duration,
          notes: params.notes,
          providerId: params.providerId,
        },
      );

      return {
        result: {
          success: true,
          appointmentId: result.eventId,
          integrationType: 'google_calendar',
          message: `Appointment booked for ${startTime.toLocaleString()}. A calendar invitation has been created.`,
        },
      };
    } catch (error) {
      this.logger.error({ accountId, error, msg: '[GCal Fallback] Failed to book appointment' });
      return {
        error: 'Booking failed',
        message:
          "I'm sorry, I had trouble booking that appointment. Let me take your information and have someone call you back.",
      };
    }
  }

  /**
   * Fallback: Check availability via Google Calendar free/busy
   */
  private async checkAvailabilityViaGoogleCalendar(
    phoneRecord: any,
    params: any,
  ) {
    const accountId = phoneRecord?.accountId;
    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);

    if (!gcAvailable) {
      return {
        error: 'No scheduling system configured',
        message: "Let me check with our staff about available times.",
      };
    }

    this.logger.log({
      accountId,
      msg: '[GCal Fallback] Checking availability via Google Calendar',
    });

    try {
      const date = params.date; // Expected: YYYY-MM-DD
      const duration = params.duration || 30;

      const result = await this.googleCalendar.checkFreeBusy(
        accountId,
        date,
        duration,
      );

      if (!result.success) {
        throw new Error('Failed to check calendar availability');
      }

      const slots = result.availableSlots || [];

      return {
        result: {
          success: true,
          integrationType: 'google_calendar',
          availableSlots: slots.map((slot) => ({
            time: slot.startTime,
            endTime: slot.endTime,
          })),
          message:
            slots.length > 0
              ? `We have ${slots.length} available time window(s) on ${date}.`
              : `No availability on ${date}. Let me check other dates.`,
        },
      };
    } catch (error) {
      this.logger.error({ accountId, error, msg: '[GCal Fallback] Failed to check availability' });
      return {
        error: 'Availability check failed',
        message: "Let me transfer you to our scheduling team.",
      };
    }
  }

  /**
   * Fallback: Cancel appointment via Google Calendar
   */
  private async cancelAppointmentViaGoogleCalendar(
    phoneRecord: any,
    params: any,
  ) {
    const accountId = phoneRecord?.accountId;
    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);

    if (!gcAvailable) {
      return {
        error: 'No scheduling system configured',
        message: "Let me help you cancel your appointment manually.",
      };
    }

    this.logger.log({
      accountId,
      msg: '[GCal Fallback] Cancelling appointment via Google Calendar',
    });

    try {
      // The appointmentId should be the Google Calendar eventId
      await this.googleCalendar.deleteEvent(accountId, params.appointmentId);

      return {
        result: {
          success: true,
          integrationType: 'google_calendar',
          message:
            "Your appointment has been cancelled successfully. Would you like to reschedule for another time?",
        },
      };
    } catch (error) {
      this.logger.error({ accountId, error, msg: '[GCal Fallback] Failed to cancel appointment' });
      return {
        error: 'Appointment cancellation failed',
        message:
          "I'm having trouble cancelling your appointment. Let me transfer you to our scheduling team.",
      };
    }
  }

  /**
   * Fallback: Get appointments via Google Calendar
   */
  private async getAppointmentsViaGoogleCalendar(
    call: any,
    params: any,
  ) {
    const accountId = await this.getAccountIdFromCall(call);
    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);

    if (!gcAvailable) {
      return {
        error: 'No scheduling system configured',
        message:
          "I'm sorry, but our scheduling system is not set up yet. Let me take your information manually.",
      };
    }

    this.logger.log({
      accountId,
      msg: '[GCal Fallback] Getting appointments via Google Calendar',
    });

    try {
      const today = new Date();
      const ninetyDaysOut = new Date(today);
      ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);

      const startDate = params.startDate ? new Date(params.startDate) : today;
      const endDate = params.endDate ? new Date(params.endDate) : ninetyDaysOut;

      const result = await this.googleCalendar.listEvents(
        accountId!,
        startDate,
        endDate,
      );

      if (!result.success) {
        throw new Error('Failed to list calendar events');
      }

      const events = result.events || [];

      return {
        result: {
          success: true,
          integrationType: 'google_calendar',
          appointments: events.map((evt) => ({
            id: evt.id,
            date: evt.startTime,
            endTime: evt.endTime,
            type: evt.summary,
            status: evt.status,
          })),
          count: events.length,
          message:
            events.length > 0
              ? `I found ${events.length} upcoming appointment(s) on the calendar.`
              : "I don't see any upcoming appointments on the calendar.",
        },
      };
    } catch (error) {
      this.logger.error({ accountId, error, msg: '[GCal Fallback] Failed to get appointments' });
      return {
        error: 'Failed to retrieve appointments',
        message:
          "I'm having trouble looking up your appointments. Can you tell me more about the appointment you're looking for?",
      };
    }
  }

  /**
   * Fallback: Reschedule appointment via Google Calendar
   * Updates the existing event with new start/end time
   */
  private async rescheduleAppointmentViaGoogleCalendar(
    call: any,
    params: any,
  ) {
    const accountId = await this.getAccountIdFromCall(call);
    const gcAvailable = await this.isGoogleCalendarAvailable(accountId);

    if (!gcAvailable) {
      return {
        error: 'No scheduling system configured',
        message:
          "I'm sorry, but our scheduling system is not set up yet. Let me take your information manually.",
      };
    }

    this.logger.log({
      accountId,
      msg: '[GCal Fallback] Rescheduling appointment via Google Calendar',
    });

    try {
      const newStartTime = new Date(params.startTime);
      const duration = params.duration || 30;
      const newEndTime = new Date(newStartTime);
      newEndTime.setMinutes(newEndTime.getMinutes() + duration);

      const result = await this.googleCalendar.updateEvent(
        accountId!,
        params.appointmentId,
        {
          start: newStartTime,
          end: newEndTime,
        },
      );

      return {
        result: {
          success: true,
          integrationType: 'google_calendar',
          appointment: result.eventId
            ? {
                id: result.eventId,
                date: newStartTime.toISOString(),
              }
            : null,
          message: `Your appointment has been rescheduled to ${newStartTime.toLocaleString()}.`,
        },
      };
    } catch (error) {
      this.logger.error({ accountId, error, msg: '[GCal Fallback] Failed to reschedule appointment' });
      return {
        error: 'Reschedule failed',
        message:
          "I'm having trouble rescheduling. Let me check availability for another time.",
      };
    }
  }
}
