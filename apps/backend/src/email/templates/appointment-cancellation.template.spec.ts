import { renderAppointmentCancellation } from './appointment-cancellation.template';

describe('renderAppointmentCancellation', () => {
  const baseData = {
    patientName: 'Jane Smith',
    clinicName: 'Test Dental',
    appointmentType: 'Root Canal',
    date: 'March 5, 2026',
    time: '2:00 PM',
  };

  it('should return html and subject', () => {
    const result = renderAppointmentCancellation(baseData);
    expect(result.html).toContain('Jane Smith');
    expect(result.html).toContain('Root Canal');
    expect(result.html).toContain('Appointment Cancelled');
    expect(result.subject).toContain('Cancelled');
    expect(result.subject).toContain('Root Canal');
  });

  it('should use red as default primary color', () => {
    const result = renderAppointmentCancellation(baseData);
    expect(result.html).toContain('#ef4444');
  });

  it('should include reason when provided', () => {
    const result = renderAppointmentCancellation({ ...baseData, reason: 'Schedule conflict' });
    expect(result.html).toContain('Schedule conflict');
  });

  it('should not include reason section when absent', () => {
    const result = renderAppointmentCancellation(baseData);
    expect(result.html).not.toContain('Reason:');
  });

  it('should use businessName when provided', () => {
    const result = renderAppointmentCancellation({ ...baseData, businessName: 'Pro Dental' });
    expect(result.html).toContain('Pro Dental');
  });
});
