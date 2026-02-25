import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { DevAuthGuard } from '../auth/dev-auth.guard';
import { CognitoJwtVerifierService } from '../auth/cognito-jwt-verifier.service';
import { createMockNotificationsService } from '../test/mocks/notifications.mock';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: any;

  beforeEach(async () => {
    const mockService = createMockNotificationsService();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: mockService },
        DevAuthGuard,
        { provide: CognitoJwtVerifierService, useValue: { verifyToken: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    notificationsService = module.get(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendAppointmentConfirmation', () => {
    it('should return success result', async () => {
      const body = {
        accountId: 'acc-1',
        patient: { firstName: 'John', lastName: 'Doe' },
        appointment: { appointmentType: 'Cleaning', startTime: new Date(), duration: 30 },
        integrationType: 'google_calendar' as const,
      };
      const result = await controller.sendAppointmentConfirmation(body);
      expect(result.success).toBe(true);
      expect(result.emailSent).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      notificationsService.sendAppointmentConfirmation.mockRejectedValue(new Error('fail'));
      const result = await controller.sendAppointmentConfirmation({
        accountId: 'acc-1',
        patient: { firstName: 'X', lastName: 'Y' },
        appointment: { appointmentType: 'Test', startTime: new Date(), duration: 30 },
        integrationType: 'pms',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('sendAppointmentCancellation', () => {
    it('should delegate to service', async () => {
      const result = await controller.sendAppointmentCancellation({
        accountId: 'acc-1',
        patient: { firstName: 'J', lastName: 'D' },
        appointment: { appointmentType: 'Cleaning', startTime: new Date(), duration: 30 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('sendAppointmentReschedule', () => {
    it('should delegate to service', async () => {
      const result = await controller.sendAppointmentReschedule({
        accountId: 'acc-1',
        patient: { firstName: 'J', lastName: 'D' },
        oldAppointment: { appointmentType: 'Cleaning', startTime: new Date(), duration: 30 },
        newAppointment: { appointmentType: 'Cleaning', startTime: new Date(), duration: 30 },
      });
      expect(result.success).toBe(true);
    });
  });
});
