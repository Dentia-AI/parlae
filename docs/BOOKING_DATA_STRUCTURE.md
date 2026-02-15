# Booking Data Structure

This document outlines the structured data we capture during appointment bookings via AI calls.

## Last Updated
February 2026

## Data Collection Overview

### Patient Information
We collect the following patient data from AI interactions:

```typescript
interface PatientInfo {
  // Required fields
  firstName: string;          // Patient's first name
  lastName: string;           // Patient's last name
  phone: string;              // Patient's phone number (primary contact)
  
  // Optional fields
  email?: string;             // Patient's email address
  dateOfBirth?: string;       // Format: YYYY-MM-DD
  
  // Internal tracking
  patientId?: string;         // PMS patient ID (if found via search)
  isNewPatient?: boolean;     // Whether this is a first-time patient
}
```

### Appointment Details
```typescript
interface AppointmentDetails {
  // Required fields
  appointmentType: string;    // Type: cleaning, exam, filling, root-canal, extraction, etc.
  startTime: string;          // ISO 8601 format: 2026-02-15T10:00:00Z
  duration: number;           // Duration in minutes (default: 30)
  
  // Optional fields
  providerId?: string;        // Specific provider/dentist if patient has preference
  notes?: string;             // Any special notes or instructions collected during call
  
  // Call context
  vapiCallId?: string;        // Vapi call ID for reference
  callTranscript?: string;    // Full or partial transcript (if needed)
  bookingSource: 'ai_call';   // Always 'ai_call' for AI bookings
}
```

### Booking Metadata
```typescript
interface BookingMetadata {
  // System tracking
  createdAt: Date;            // When booking was made
  createdBy: 'vapi_assistant'; // Always 'vapi_assistant' for AI bookings
  accountId: string;          // Clinic account ID
  
  // Call details
  vapiCallId?: string;        // Vapi call ID
  callDuration?: number;      // Call duration in seconds
  
  // Integration used
  integrationType: 'pms' | 'google_calendar'; // Which system was used
  integrationId?: string;     // PMS integration ID or Google Calendar ID
  
  // External IDs
  externalAppointmentId?: string; // ID from PMS or Google Calendar
  externalEventLink?: string;     // Link to view in PMS/Google Calendar
}
```

### Confirmation Data
```typescript
interface ConfirmationData {
  // What to send
  confirmationType: 'booking' | 'cancellation' | 'reschedule';
  
  // Recipients
  patientPhone?: string;      // Patient's phone for SMS
  patientEmail?: string;      // Patient's email
  clinicPhone?: string;       // Clinic's phone for SMS notification
  clinicEmail?: string;       // Clinic's email for notification
  
  // Message content (auto-generated)
  smsMessage: string;         // SMS confirmation message
  emailSubject: string;       // Email subject line
  emailBody: string;          // HTML email body
}
```

## Complete Booking Request Example

```json
{
  "patient": {
    "firstName": "John",
    "lastName": "Smith",
    "phone": "+14165551234",
    "email": "john.smith@example.com",
    "dateOfBirth": "1985-03-15",
    "isNewPatient": false,
    "patientId": "PAT-12345"
  },
  "appointment": {
    "appointmentType": "cleaning",
    "startTime": "2026-02-20T14:00:00Z",
    "duration": 30,
    "providerId": "DR-001",
    "notes": "Patient mentioned sensitivity on lower left molars. Prefers afternoon appointments.",
    "vapiCallId": "call_abc123xyz",
    "bookingSource": "ai_call"
  },
  "metadata": {
    "accountId": "acc_clinic123",
    "vapiCallId": "call_abc123xyz",
    "callDuration": 180
  },
  "sendConfirmation": true
}
```

## Notes for Future Changes

### Flexibility Considerations
- All optional fields can be null/undefined
- New fields can be added without breaking existing code
- The `notes` field is freeform and can contain any AI-collected information
- The `appointmentType` is a string to allow for custom appointment types
- Dates use ISO 8601 format for consistency across timezones

### Potential Future Enhancements
1. Add `preferredLanguage` field for multilingual support
2. Add `insuranceInfo` object for insurance verification
3. Add `reasonForVisit` separate from `notes` for better categorization
4. Add `emergencyContact` object for new patients
5. Add `allergies` array for medical safety
6. Add `medications` array for drug interaction checks
7. Add `referralSource` to track how patient found the clinic

### Data Privacy & Security
- All patient data is considered PHI (Protected Health Information)
- All API calls are logged with PHI access tracking
- Patient phone/email is redacted in logs
- Full data is only stored in secure database
- Confirmations should use minimal PHI

## API Endpoints Using This Data

### Booking
- `POST /api/pms/appointments` - Creates appointment (PMS or Google Calendar)
- `POST /api/google-calendar/events` - Direct Google Calendar creation

### Updates
- `PATCH /api/pms/appointments/:id` - Reschedule appointment
- `DELETE /api/pms/appointments/:id` - Cancel appointment

### Confirmations
- `POST /api/notifications/appointment-confirmation` - Send confirmation
- `POST /api/notifications/appointment-cancellation` - Send cancellation
- `POST /api/notifications/appointment-update` - Send update

## Change Log

### 2026-02-14
- Initial data structure defined
- Added comprehensive patient and appointment fields
- Documented confirmation flow
- Added metadata for tracking
