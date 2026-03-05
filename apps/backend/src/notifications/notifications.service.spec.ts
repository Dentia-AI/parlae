import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioMessagingService } from '../twilio/twilio-messaging.service';
import { EmailService } from '../email/email.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';
import { createMockTwilioMessagingService } from '../test/mocks/twilio.mock';
import { createMockEmailService } from '../test/mocks/ses.mock';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;
  let twilioService: any;
  let emailService: any;

  const mockAccount = {
    name: 'Test Clinic',
    email: 'clinic@test.com',
    twilioMessagingServiceSid: 'MG_test',
    brandingLogoUrl: null,
    brandingBusinessName: null,
    brandingPrimaryColor: null,
    brandingContactEmail: null,
    brandingContactPhone: null,
    brandingAddress: null,
    brandingWebsite: null,
    brandingTimezone: null,
  };

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const mockTwilio = createMockTwilioMessagingService();
    const mockEmail = createMockEmailService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TwilioMessagingService, useValue: mockTwilio },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get(PrismaService);
    twilioService = module.get(TwilioMessagingService);
    emailService = module.get(EmailService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendAppointmentConfirmation', () => {
    const params = {
      accountId: 'acc-1',
      patient: { firstName: 'John', lastName: 'Doe', phone: '+14155551234', email: 'john@example.com' },
      appointment: { appointmentType: 'Cleaning', startTime: new Date('2026-03-01T14:00:00Z'), duration: 30 },
      integrationType: 'google_calendar' as const,
    };

    it('should send SMS and email when both available', async () => {
      prisma.account.findUnique.mockResolvedValue(mockAccount);
      const result = await service.sendAppointmentConfirmation(params);
      expect(result.smsSent).toBe(true);
      expect(result.emailSent).toBe(true);
      expect(twilioService.sendSms).toHaveBeenCalled();
      expect(emailService.sendEmail).toHaveBeenCalled();
    });

    it('should throw when account not found', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      await expect(service.sendAppointmentConfirmation(params)).rejects.toThrow('Account not found');
    });

    it('should skip SMS when no phone', async () => {
      prisma.account.findUnique.mockResolvedValue(mockAccount);
      const noPhone = { ...params, patient: { ...params.patient, phone: undefined } };
      const result = await service.sendAppointmentConfirmation(noPhone);
      expect(result.smsSent).toBe(false);
      expect(twilioService.sendSms).not.toHaveBeenCalled();
    });

    it('should skip SMS when no messaging service SID', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...mockAccount, twilioMessagingServiceSid: null });
      const result = await service.sendAppointmentConfirmation(params);
      expect(result.smsSent).toBe(false);
    });

    it('should handle SMS failure gracefully', async () => {
      prisma.account.findUnique.mockResolvedValue(mockAccount);
      twilioService.sendSms.mockRejectedValueOnce(new Error('SMS failed'));
      const result = await service.sendAppointmentConfirmation(params);
      expect(result.smsSent).toBe(false);
      expect(result.emailSent).toBe(true);
    });

    it('should handle email failure gracefully', async () => {
      prisma.account.findUnique.mockResolvedValue(mockAccount);
      emailService.sendEmail.mockRejectedValue(new Error('SES error'));
      const result = await service.sendAppointmentConfirmation(params);
      expect(result.smsSent).toBe(true);
      expect(result.emailSent).toBe(false);
    });
  });

  describe('sendAppointmentConfirmation – email-confirmations feature flag', () => {
    const params = {
      accountId: 'acc-1',
      patient: { firstName: 'John', lastName: 'Doe', phone: '+14155551234', email: 'john@example.com' },
      appointment: { appointmentType: 'Cleaning', startTime: new Date('2026-03-01T14:00:00Z'), duration: 30 },
      integrationType: 'google_calendar' as const,
    };

    it('should skip patient email when email-confirmations is disabled', async () => {
      prisma.account.findUnique.mockResolvedValue({
        ...mockAccount,
        featureSettings: { 'email-confirmations': false },
      });
      const result = await service.sendAppointmentConfirmation(params);
      expect(result.smsSent).toBe(true);
      expect(result.emailSent).toBe(false);
      // Clinic notification email is still sent; patient email (to john@example.com) is not
      const emailCalls = emailService.sendEmail.mock.calls;
      const patientEmailCalls = emailCalls.filter((call: any[]) => call[0]?.to === 'john@example.com');
      expect(patientEmailCalls).toHaveLength(0);
    });

    it('should send email when email-confirmations is explicitly enabled', async () => {
      prisma.account.findUnique.mockResolvedValue({
        ...mockAccount,
        featureSettings: { 'email-confirmations': true },
      });
      const result = await service.sendAppointmentConfirmation(params);
      expect(result.emailSent).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalled();
    });

    it('should send email when featureSettings is empty (defaults to enabled)', async () => {
      prisma.account.findUnique.mockResolvedValue({
        ...mockAccount,
        featureSettings: {},
      });
      const result = await service.sendAppointmentConfirmation(params);
      expect(result.emailSent).toBe(true);
    });

    it('should skip both SMS and email when both features are disabled', async () => {
      prisma.account.findUnique.mockResolvedValue({
        ...mockAccount,
        featureSettings: { 'sms-confirmations': false, 'email-confirmations': false },
      });
      const result = await service.sendAppointmentConfirmation(params);
      expect(result.smsSent).toBe(false);
      expect(result.emailSent).toBe(false);
    });
  });

  describe('sendAppointmentCancellation', () => {
    it('should send cancellation notifications', async () => {
      prisma.account.findUnique.mockResolvedValue(mockAccount);
      const result = await service.sendAppointmentCancellation({
        accountId: 'acc-1',
        patient: { firstName: 'Jane', lastName: 'Smith', phone: '+14155559999', email: 'jane@test.com' },
        appointment: { appointmentType: 'Checkup', startTime: new Date(), duration: 30 },
        reason: 'Schedule conflict',
      });
      expect(result.emailSent).toBe(true);
      expect(result.smsSent).toBe(true);
    });

    it('should throw when account not found', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      await expect(service.sendAppointmentCancellation({
        accountId: 'bad',
        patient: { firstName: 'X', lastName: 'Y' },
        appointment: { appointmentType: 'Test', startTime: new Date(), duration: 30 },
      })).rejects.toThrow('Account not found');
    });
  });

  describe('sendAppointmentCancellation – email-confirmations flag', () => {
    it('should skip patient email when email-confirmations is disabled', async () => {
      prisma.account.findUnique.mockResolvedValue({
        ...mockAccount,
        featureSettings: { 'email-confirmations': false },
      });
      const result = await service.sendAppointmentCancellation({
        accountId: 'acc-1',
        patient: { firstName: 'Jane', lastName: 'Smith', phone: '+14155559999', email: 'jane@test.com' },
        appointment: { appointmentType: 'Checkup', startTime: new Date(), duration: 30 },
        reason: 'Schedule conflict',
      });
      expect(result.smsSent).toBe(true);
      expect(result.emailSent).toBe(false);
    });
  });

  describe('sendAppointmentReschedule', () => {
    it('should send reschedule notifications', async () => {
      prisma.account.findUnique.mockResolvedValue(mockAccount);
      const result = await service.sendAppointmentReschedule({
        accountId: 'acc-1',
        patient: { firstName: 'Bob', lastName: 'Lee', phone: '+14155550000', email: 'bob@test.com' },
        oldAppointment: { appointmentType: 'Cleaning', startTime: new Date(), duration: 30 },
        newAppointment: { appointmentType: 'Cleaning', startTime: new Date(Date.now() + 86400000), duration: 30 },
      });
      expect(result.emailSent).toBe(true);
      expect(result.smsSent).toBe(true);
    });

    it('should skip patient email when email-confirmations is disabled', async () => {
      prisma.account.findUnique.mockResolvedValue({
        ...mockAccount,
        featureSettings: { 'email-confirmations': false },
      });
      const result = await service.sendAppointmentReschedule({
        accountId: 'acc-1',
        patient: { firstName: 'Bob', lastName: 'Lee', phone: '+14155550000', email: 'bob@test.com' },
        oldAppointment: { appointmentType: 'Cleaning', startTime: new Date(), duration: 30 },
        newAppointment: { appointmentType: 'Cleaning', startTime: new Date(Date.now() + 86400000), duration: 30 },
      });
      expect(result.smsSent).toBe(true);
      expect(result.emailSent).toBe(false);
    });
  });

  describe('sendClinicBookingNotification', () => {
    it('should send booking notification to clinic', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...mockAccount, brandingContactEmail: 'admin@clinic.com' });
      const result = await service.sendClinicBookingNotification({
        accountId: 'acc-1',
        patient: { firstName: 'Pat', lastName: 'Test' },
        appointment: { appointmentType: 'Cleaning', startTime: new Date(), duration: 30 },
      });
      expect(result).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalled();
    });

    it('should return false when account not found', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      const result = await service.sendClinicBookingNotification({
        accountId: 'bad',
        patient: { firstName: 'Pat', lastName: 'Test' },
        appointment: { appointmentType: 'Cleaning', startTime: new Date(), duration: 30 },
      });
      expect(result).toBe(false);
    });

    it('should return false when no clinic email', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...mockAccount, email: null, brandingContactEmail: null });
      const result = await service.sendClinicBookingNotification({
        accountId: 'acc-1',
        patient: { firstName: 'Pat', lastName: 'Test' },
        appointment: { appointmentType: 'Cleaning', startTime: new Date(), duration: 30 },
      });
      expect(result).toBe(false);
    });
  });

  describe('sendPmsFailureNotification', () => {
    it('should send PMS failure notification', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...mockAccount, brandingContactEmail: 'admin@clinic.com' });
      const result = await service.sendPmsFailureNotification({
        accountId: 'acc-1',
        patient: { firstName: 'Pat', lastName: 'Test' },
        appointment: { appointmentType: 'Cleaning', startTime: new Date(), duration: 30 },
        pmsErrorMessage: 'Timeout',
        gcalBackupCreated: true,
      });
      expect(result).toBe(true);
    });
  });
});
