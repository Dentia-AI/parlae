export const createMockNotificationsService = () => ({
  sendAppointmentConfirmation: jest.fn().mockResolvedValue({
    emailSent: true,
    smsSent: true,
  }),
  sendAppointmentCancellation: jest.fn().mockResolvedValue({
    emailSent: true,
    smsSent: true,
  }),
  sendAppointmentReschedule: jest.fn().mockResolvedValue({
    emailSent: true,
    smsSent: true,
  }),
  sendClinicBookingNotification: jest.fn().mockResolvedValue(true),
  sendPmsFailureNotification: jest.fn().mockResolvedValue(true),
});
