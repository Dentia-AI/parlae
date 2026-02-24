export const createMockGoogleCalendarService = () => ({
  getAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?test'),
  exchangeCodeForTokens: jest.fn().mockResolvedValue({
    success: true,
    email: 'test@clinic.com',
    calendarId: 'primary',
  }),
  refreshAccessToken: jest.fn().mockResolvedValue('new_access_token'),
  createEvent: jest.fn().mockResolvedValue({
    success: true,
    eventId: 'event_123',
    htmlLink: 'https://calendar.google.com/event/123',
  }),
  createAppointmentEvent: jest.fn().mockResolvedValue({
    success: true,
    eventId: 'appt_event_123',
    htmlLink: 'https://calendar.google.com/event/appt_123',
  }),
  updateEvent: jest.fn().mockResolvedValue({
    success: true,
    eventId: 'event_123',
    htmlLink: 'https://calendar.google.com/event/123',
  }),
  deleteEvent: jest.fn().mockResolvedValue({ success: true }),
  listEvents: jest.fn().mockResolvedValue({
    success: true,
    events: [],
  }),
  findEventsByPatient: jest.fn().mockResolvedValue({
    success: true,
    events: [],
  }),
  checkFreeBusy: jest.fn().mockResolvedValue({
    success: true,
    availableSlots: [
      { startTime: '2026-03-01T09:00:00Z', endTime: '2026-03-01T12:00:00Z' },
    ],
    busySlots: [],
  }),
  findNextAvailableSlots: jest.fn().mockResolvedValue({
    success: true,
    slots: [],
  }),
  isConnectedForAccount: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(undefined),
  isConfigured: jest.fn().mockReturnValue(true),
});
