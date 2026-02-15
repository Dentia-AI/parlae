/**
 * Google Calendar Booking Utilities
 * 
 * Helper functions for booking appointments directly to Google Calendar
 * when no PMS integration is available.
 */

interface PatientInfo {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  patientId?: string;
}

interface AppointmentDetails {
  appointmentType: string;
  startTime: Date;
  duration: number;
  notes?: string;
  providerId?: string;
}

/**
 * Book appointment in Google Calendar
 * This is used as a fallback when no PMS is connected
 */
export async function bookGoogleCalendarAppointment(
  accountId: string,
  patient: PatientInfo,
  appointment: AppointmentDetails,
  vapiCallId?: string,
) {
  try {
    // Call backend Google Calendar service
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:4000'}/google-calendar/appointments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId,
          patient,
          appointment,
          vapiCallId,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create Google Calendar event');
    }

    const result = await response.json();

    return {
      success: true,
      eventId: result.eventId,
      htmlLink: result.htmlLink,
      integrationType: 'google_calendar' as const,
    };
  } catch (error: any) {
    console.error('[GoogleCalendar] Failed to book appointment:', error);
    return {
      success: false,
      error: {
        code: 'GOOGLE_CALENDAR_ERROR',
        message: error.message || 'Failed to create Google Calendar event',
      },
    };
  }
}

/**
 * Send booking confirmation via backend
 */
export async function sendBookingConfirmation(
  accountId: string,
  patient: PatientInfo,
  appointment: AppointmentDetails,
  integrationType: 'pms' | 'google_calendar',
  externalEventLink?: string,
) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:4000'}/notifications/appointment-confirmation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId,
          patient,
          appointment: {
            ...appointment,
            externalEventLink,
          },
          integrationType,
        }),
      },
    );

    if (!response.ok) {
      throw new Error('Failed to send confirmation');
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error('[Notifications] Failed to send confirmation:', error);
    // Don't fail the booking if notifications fail
    return {
      emailSent: false,
      smsSent: false,
      error: error.message,
    };
  }
}

/**
 * Send cancellation notification via backend
 */
export async function sendCancellationNotification(
  accountId: string,
  patient: PatientInfo,
  appointment: AppointmentDetails,
  reason?: string,
) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:4000'}/notifications/appointment-cancellation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId,
          patient,
          appointment,
          reason,
        }),
      },
    );

    if (!response.ok) {
      throw new Error('Failed to send cancellation notification');
    }

    return await response.json();
  } catch (error: any) {
    console.error('[Notifications] Failed to send cancellation:', error);
    return {
      emailSent: false,
      smsSent: false,
      error: error.message,
    };
  }
}

/**
 * Send reschedule notification via backend
 */
export async function sendRescheduleNotification(
  accountId: string,
  patient: PatientInfo,
  oldAppointment: AppointmentDetails,
  newAppointment: AppointmentDetails,
) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:4000'}/notifications/appointment-reschedule`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId,
          patient,
          oldAppointment,
          newAppointment,
        }),
      },
    );

    if (!response.ok) {
      throw new Error('Failed to send reschedule notification');
    }

    return await response.json();
  } catch (error: any) {
    console.error('[Notifications] Failed to send reschedule:', error);
    return {
      emailSent: false,
      smsSent: false,
      error: error.message,
    };
  }
}

/**
 * Extract patient information from Vapi call data
 * This helps structure the data collected during the AI call
 */
export function extractPatientFromVapiData(data: any): PatientInfo | null {
  try {
    // Try to extract from message.toolCalls or message.data
    const toolCallData = data.message?.toolCalls?.[0]?.function?.arguments;
    const messageData = data.data || data.message?.data;
    
    const rawData = toolCallData || messageData || data;

    // Handle different data structures
    const patient = rawData.patient || rawData;

    if (!patient.firstName || !patient.lastName) {
      return null;
    }

    return {
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      email: patient.email,
      dateOfBirth: patient.dateOfBirth,
      patientId: patient.patientId,
    };
  } catch (error) {
    console.error('[Vapi] Failed to extract patient info:', error);
    return null;
  }
}

/**
 * Extract appointment details from Vapi call data
 */
export function extractAppointmentFromVapiData(data: any): AppointmentDetails | null {
  try {
    const toolCallData = data.message?.toolCalls?.[0]?.function?.arguments;
    const messageData = data.data || data.message?.data;
    
    const rawData = toolCallData || messageData || data;
    const appointment = rawData.appointment || rawData;

    if (!appointment.appointmentType || !appointment.startTime) {
      return null;
    }

    return {
      appointmentType: appointment.appointmentType,
      startTime: new Date(appointment.startTime),
      duration: appointment.duration || 30,
      notes: appointment.notes,
      providerId: appointment.providerId,
    };
  } catch (error) {
    console.error('[Vapi] Failed to extract appointment info:', error);
    return null;
  }
}
