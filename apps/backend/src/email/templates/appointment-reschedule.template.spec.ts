import { renderAppointmentReschedule } from './appointment-reschedule.template';

describe('renderAppointmentReschedule', () => {
  const baseData = {
    patientName: 'Bob Lee',
    clinicName: 'Test Dental',
    appointmentType: 'Checkup',
    oldDate: 'March 1, 2026',
    oldTime: '9:00 AM',
    newDate: 'March 3, 2026',
    newTime: '11:00 AM',
    duration: '45 minutes',
  };

  it('should return html and subject', () => {
    const result = renderAppointmentReschedule(baseData);
    expect(result.html).toContain('Bob Lee');
    expect(result.html).toContain('Appointment Rescheduled');
    expect(result.html).toContain('March 1, 2026');
    expect(result.html).toContain('March 3, 2026');
    expect(result.subject).toContain('Rescheduled');
    expect(result.subject).toContain('March 3, 2026');
  });

  it('should show old time with strikethrough', () => {
    const result = renderAppointmentReschedule(baseData);
    expect(result.html).toContain('line-through');
    expect(result.html).toContain('9:00 AM');
  });

  it('should show new appointment details prominently', () => {
    const result = renderAppointmentReschedule(baseData);
    expect(result.html).toContain('New Appointment');
    expect(result.html).toContain('11:00 AM');
    expect(result.html).toContain('45 minutes');
  });

  it('should use amber as default primary color', () => {
    const result = renderAppointmentReschedule(baseData);
    expect(result.html).toContain('#f59e0b');
  });
});
