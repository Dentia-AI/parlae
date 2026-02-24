import { renderAppointmentConfirmation } from './appointment-confirmation.template';

describe('renderAppointmentConfirmation', () => {
  const baseData = {
    patientName: 'John Doe',
    clinicName: 'Test Dental',
    appointmentType: 'Cleaning',
    date: 'March 1, 2026',
    time: '10:00 AM',
    duration: '30 minutes',
  };

  it('should return html and subject', () => {
    const result = renderAppointmentConfirmation(baseData);
    expect(result.html).toContain('John Doe');
    expect(result.html).toContain('Cleaning');
    expect(result.html).toContain('March 1, 2026');
    expect(result.html).toContain('10:00 AM');
    expect(result.html).toContain('30 minutes');
    expect(result.subject).toContain('Cleaning');
    expect(result.subject).toContain('March 1, 2026');
  });

  it('should use default primary color', () => {
    const result = renderAppointmentConfirmation(baseData);
    expect(result.html).toContain('#3b82f6');
  });

  it('should use custom primary color', () => {
    const result = renderAppointmentConfirmation({ ...baseData, primaryColor: '#ff0000' });
    expect(result.html).toContain('#ff0000');
  });

  it('should use businessName when provided', () => {
    const result = renderAppointmentConfirmation({ ...baseData, businessName: 'Custom Dental' });
    expect(result.html).toContain('Custom Dental');
  });

  it('should include logo when provided', () => {
    const result = renderAppointmentConfirmation({ ...baseData, logoUrl: 'https://example.com/logo.png' });
    expect(result.html).toContain('https://example.com/logo.png');
  });

  it('should include notes when provided', () => {
    const result = renderAppointmentConfirmation({ ...baseData, notes: 'Bring insurance card' });
    expect(result.html).toContain('Bring insurance card');
  });

  it('should include contact info when provided', () => {
    const result = renderAppointmentConfirmation({
      ...baseData,
      contactPhone: '555-1234',
      contactEmail: 'info@dental.com',
      address: '123 Main St',
    });
    expect(result.html).toContain('555-1234');
    expect(result.html).toContain('info@dental.com');
    expect(result.html).toContain('123 Main St');
  });

  it('should include location when provided', () => {
    const result = renderAppointmentConfirmation({ ...baseData, location: 'Room 5B' });
    expect(result.html).toContain('Room 5B');
  });
});
