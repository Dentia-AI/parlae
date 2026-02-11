import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HipaaAuditService } from '../common/services/hipaa-audit.service';
import twilio from 'twilio';

@Injectable()
export class VapiToolsService {
  private readonly logger = new Logger(VapiToolsService.name);

  constructor(
    private prisma: PrismaService,
    private hipaaAudit: HipaaAuditService,
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
      // TODO: Add VapiCallLog model to schema
      // await this.prisma.vapiCallLog.updateMany({
      //   where: { callId: call.id },
      //   data: {
      //     transferRequested: true,
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
        return {
          error: 'PMS not configured',
          message: "I apologize, but appointment booking is not set up yet. Please call us directly.",
        };
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
      const result = await sikkaService.bookAppointment({
        patientId: params.patientId,
        appointmentType: params.type || 'General',
        startTime: new Date(params.datetime),
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
        include: { pmsIntegration: true },
      });

      if (!phoneRecord?.pmsIntegration) {
        return {
          error: 'PMS not configured',
          message: "Let me check with our staff about available times.",
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

      const result = await sikkaService.checkAvailability({
        date: params.date,
        appointmentType: params.type,
        duration: params.duration || 30,
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

      const result = await sikkaService.createPatient({
        firstName: params.firstName,
        lastName: params.lastName,
        phone: params.phone,
        email: params.email,
        dateOfBirth: params.dateOfBirth,
        address: params.address,
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
   */
  async cancelAppointment(payload: any) {
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
          message: "Let me help you cancel your appointment manually.",
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
}
