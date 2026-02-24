import { renderClinicBookingNotification } from './clinic-booking-notification.template';

describe('renderClinicBookingNotification', () => {
  const baseData = {
    clinicName: 'Happy Dental',
    patientName: 'Alice Walker',
    appointmentType: 'Cleaning',
    date: 'March 10, 2026',
    time: '3:00 PM',
    duration: '30 minutes',
    bookingSource: 'google_calendar' as const,
  };

  it('should render google_calendar booking notification', () => {
    const result = renderClinicBookingNotification(baseData);
    expect(result.html).toContain('Alice Walker');
    expect(result.html).toContain('New Appointment Booked');
    expect(result.html).toContain('Cleaning');
    expect(result.subject).toContain('New Appointment');
  });

  it('should render pms_failure notification with urgency', () => {
    const result = renderClinicBookingNotification({
      ...baseData,
      bookingSource: 'pms_failure',
      pmsErrorMessage: 'Sikka API timeout',
    });
    expect(result.html).toContain('Action Required');
    expect(result.html).toContain('PMS Writeback Failed');
    expect(result.html).toContain('Sikka API timeout');
    expect(result.subject).toContain('URGENT');
  });

  it('should include patient phone when provided', () => {
    const result = renderClinicBookingNotification({
      ...baseData,
      patientPhone: '+14155551234',
    });
    expect(result.html).toContain('+14155551234');
  });

  it('should include notes when provided', () => {
    const result = renderClinicBookingNotification({
      ...baseData,
      notes: 'Patient has braces',
    });
    expect(result.html).toContain('Patient has braces');
  });

  it('should include Google Calendar link when provided', () => {
    const result = renderClinicBookingNotification({
      ...baseData,
      gcalEventLink: 'https://calendar.google.com/event/abc',
    });
    expect(result.html).toContain('https://calendar.google.com/event/abc');
  });

  it('should include HIPAA disclaimer', () => {
    const result = renderClinicBookingNotification(baseData);
    expect(result.html).toContain('CONFIDENTIALITY NOTICE');
  });

  it('should mention GCal backup on pms_failure with backup', () => {
    const result = renderClinicBookingNotification({
      ...baseData,
      bookingSource: 'pms_failure',
      gcalBackupCreated: true,
    });
    expect(result.html).toContain('backup event has been created in Google Calendar');
  });
});
