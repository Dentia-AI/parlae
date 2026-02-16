/**
 * Vapi PMS Tools Configuration
 * 
 * This file defines all the tools that Vapi AI assistants can use to interact
 * with Practice Management Systems (PMS) like Sikka.
 * 
 * IMPORTANT: Tool parameter names MUST match the Sikka service method signatures.
 * See: apps/backend/src/pms/providers/sikka.service.ts
 * 
 * These tools enable the AI to:
 * - Search for patients by phone, name, or email (phone-first strategy)
 * - Check appointment availability by date
 * - Book, reschedule, and cancel appointments
 * - Create and update patient records
 * - Add notes to patient records
 * - Look up existing appointments (for cancel/reschedule flows)
 * - Check insurance and billing information
 */

// Tool calls go directly to the NestJS backend API (not through the Next.js frontend).
// In production: https://api.parlae.ca/vapi/webhook
// In development: http://localhost:3333/vapi/webhook (or ngrok URL)
//
// NOTE: These constants are evaluated at module-load time. For server-side code
// in Next.js API routes / server actions, env vars are available at this point.
// The buildMemberPayload() in template-utils.ts also overrides tool server URLs
// at squad-build time with the RuntimeConfig.webhookUrl to guarantee correctness.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';
const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || '';

const WEBHOOK_URL = BACKEND_URL
  ? `${BACKEND_URL}/vapi/webhook`
  : `${FRONTEND_URL}/api/vapi/webhook`;
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || process.env.VAPI_SERVER_SECRET || '';

// ============================================================================
// Tool Definitions - Parameters match Sikka API exactly
// ============================================================================

/**
 * Search for patients by phone, name, or email.
 * 
 * Sikka API: GET /patients/search
 * Backend: sikkaService.searchPatients({ query, limit })
 * 
 * The `query` param is a general search - phone numbers, names, or email all work.
 * System prompt should instruct AI to ask for phone first (most reliable identifier).
 */
export const searchPatientsTool = {
  type: 'function' as const,
  function: {
    name: 'searchPatients',
    description: 'Search for a patient in the practice management system. Accepts phone number, patient name, or email as the search query. Phone number is the most reliable way to find a patient - always try phone first.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term: phone number (preferred), patient name, or email address. Phone number should be digits only or formatted like +1XXXXXXXXXX.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return. Default: 5',
        },
      },
      required: ['query'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 15,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me look up your record...',
    },
    {
      type: 'request-response-delayed' as const,
      content: 'Still searching, one moment please...',
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble accessing our records right now. Let me take your information manually.",
    },
  ],
};

/**
 * Get detailed patient information by ID.
 * 
 * Sikka API: GET /patients/{patientId}
 * Backend: sikkaService.getPatient(patientId)
 * 
 * Use after searchPatients returns a match to get full details.
 */
export const getPatientInfoTool = {
  type: 'function' as const,
  function: {
    name: 'getPatientInfo',
    description: 'Get detailed information about a patient by their patient ID. Use this after finding a patient with searchPatients to get their full record including contact info, last visit, and balance.',
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'The patient ID from the PMS system (returned by searchPatients)',
        },
      },
      required: ['patientId'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 15,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me pull up your details...',
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble accessing your record. Let me verify your information.",
    },
  ],
};

/**
 * Create a new patient record.
 * 
 * Sikka API: POST /patient
 * Backend: sikkaService.createPatient({ firstName, lastName, phone, email, dateOfBirth, address, notes })
 * 
 * Use when searchPatients returns no results for a new patient.
 */
export const createPatientTool = {
  type: 'function' as const,
  function: {
    name: 'createPatient',
    description: 'Create a new patient record in the practice management system. Use this when a patient is not found via searchPatients. First name, last name, and phone are required.',
    parameters: {
      type: 'object',
      properties: {
        firstName: {
          type: 'string',
          description: "Patient's first name",
        },
        lastName: {
          type: 'string',
          description: "Patient's last name",
        },
        phone: {
          type: 'string',
          description: "Patient's phone number (required for appointment confirmations)",
        },
        email: {
          type: 'string',
          description: "Patient's email address (recommended for email confirmations)",
        },
        dateOfBirth: {
          type: 'string',
          format: 'date',
          description: "Patient's date of birth in YYYY-MM-DD format (optional but helpful for record matching)",
        },
        notes: {
          type: 'string',
          description: 'Any notes about the patient collected during the call (optional)',
        },
      },
      required: ['firstName', 'lastName', 'phone'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 20,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me set up your patient profile...',
    },
    {
      type: 'request-complete' as const,
      content: "I've created your profile.",
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble creating your profile. Let me take your information and we'll get it set up.",
    },
  ],
};

/**
 * Update existing patient information.
 * 
 * Sikka API: PATCH /patient/{patientId}
 * Backend: sikkaService.updatePatient(patientId, { phone, email, address, notes })
 */
export const updatePatientTool = {
  type: 'function' as const,
  function: {
    name: 'updatePatient',
    description: 'Update an existing patient record. Use when a patient needs to change their phone, email, or address.',
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'The patient ID to update',
        },
        phone: {
          type: 'string',
          description: 'New phone number (optional)',
        },
        email: {
          type: 'string',
          description: 'New email address (optional)',
        },
        address: {
          type: 'object',
          description: 'New address (optional)',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' },
          },
        },
        notes: {
          type: 'string',
          description: 'Updated notes (optional)',
        },
      },
      required: ['patientId'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 15,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me update your information...',
    },
    {
      type: 'request-complete' as const,
      content: "Done! I've updated your information.",
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble updating your record. Let me note the changes and our team will update it.",
    },
  ],
};

/**
 * Check available appointment slots.
 * 
 * Sikka API: GET /appointments_available_slots
 * Backend: sikkaService.checkAvailability({ date, duration, providerId, appointmentType })
 * 
 * IMPORTANT: `date` is YYYY-MM-DD format, `duration` is in minutes (default 30).
 */
export const checkAvailabilityTool = {
  type: 'function' as const,
  function: {
    name: 'checkAvailability',
    description: 'Check available appointment time slots for a specific date. Use this before booking to show patients what times are open. Returns a list of available time slots with provider information.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          format: 'date',
          description: 'Date to check availability (YYYY-MM-DD format). Example: 2026-02-20',
        },
        duration: {
          type: 'number',
          description: 'Appointment duration in minutes. Default: 30. Use 60 for longer procedures.',
        },
        providerId: {
          type: 'string',
          description: 'Specific provider/dentist ID if patient has a preference (optional). Omit to check all providers.',
        },
        appointmentType: {
          type: 'string',
          description: 'Type of appointment: cleaning, exam, filling, root-canal, extraction, consultation, emergency, cosmetic (optional)',
        },
      },
      required: ['date'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 20,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me check our available times...',
    },
    {
      type: 'request-response-delayed' as const,
      content: 'Still checking availability, one moment...',
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble checking our schedule. Let me see what I can do.",
    },
  ],
};

/**
 * Book a new appointment.
 * 
 * Sikka API: POST /appointment
 * Backend: sikkaService.bookAppointment({ patientId, providerId, appointmentType, startTime, duration, notes })
 * 
 * IMPORTANT: 
 * - `patientId` is REQUIRED - search/create patient first
 * - `startTime` is ISO 8601 format (e.g., 2026-02-20T10:00:00Z)
 * - `duration` is in minutes
 * - `appointmentType` is required
 */
export const bookAppointmentTool = {
  type: 'function' as const,
  function: {
    name: 'bookAppointment',
    description: 'Book an appointment for a patient. IMPORTANT: You must have the patientId from searchPatients or createPatient before booking. Always check availability first, then confirm details with the patient before calling this.',
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Patient ID from the PMS (obtained via searchPatients or createPatient). REQUIRED.',
        },
        providerId: {
          type: 'string',
          description: 'Provider/dentist ID for the appointment (from checkAvailability results or patient preference). Optional - system will assign if omitted.',
        },
        appointmentType: {
          type: 'string',
          description: 'Type of appointment: cleaning, exam, filling, root-canal, extraction, consultation, emergency, cosmetic. REQUIRED.',
        },
        startTime: {
          type: 'string',
          format: 'date-time',
          description: 'Appointment start time in ISO 8601 format. Example: 2026-02-20T10:00:00Z. REQUIRED.',
        },
        duration: {
          type: 'number',
          description: 'Duration in minutes. REQUIRED. Common values: 30 (cleaning/exam), 60 (filling/consultation), 90 (root canal).',
        },
        notes: {
          type: 'string',
          description: 'Any notes, special requests, or concerns the patient mentioned during the call. Include pain details, preferences, or accessibility needs.',
        },
      },
      required: ['patientId', 'appointmentType', 'startTime', 'duration'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 25,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me book that appointment for you...',
    },
    {
      type: 'request-response-delayed' as const,
      content: "I'm confirming your appointment, just a moment...",
    },
    {
      type: 'request-complete' as const,
      content: 'Your appointment has been booked!',
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble booking that time slot. It may have just been taken. Let me check again.",
    },
  ],
};

/**
 * Reschedule an existing appointment.
 * 
 * Sikka API: PATCH /appointments/{appointmentId}
 * Backend: sikkaService.rescheduleAppointment(appointmentId, { startTime, duration, providerId, appointmentType, notes })
 */
export const rescheduleAppointmentTool = {
  type: 'function' as const,
  function: {
    name: 'rescheduleAppointment',
    description: 'Reschedule an existing appointment to a new date/time. Get the appointmentId from getAppointments first, then check availability for the new time before rescheduling.',
    parameters: {
      type: 'object',
      properties: {
        appointmentId: {
          type: 'string',
          description: 'ID of the appointment to reschedule (from getAppointments)',
        },
        startTime: {
          type: 'string',
          format: 'date-time',
          description: 'New appointment start time in ISO 8601 format. Example: 2026-02-25T14:00:00Z',
        },
        duration: {
          type: 'number',
          description: 'New duration in minutes (optional - keeps original if omitted)',
        },
        providerId: {
          type: 'string',
          description: 'New provider ID (optional - keeps original if omitted)',
        },
        notes: {
          type: 'string',
          description: 'Reason for rescheduling or updated notes (optional)',
        },
      },
      required: ['appointmentId', 'startTime'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 20,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me reschedule your appointment...',
    },
    {
      type: 'request-complete' as const,
      content: "Done! Your appointment has been rescheduled.",
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble rescheduling. Let me try again or find another time.",
    },
  ],
};

/**
 * Cancel an existing appointment.
 * 
 * Sikka API: DELETE /appointments/{appointmentId}
 * Backend: sikkaService.cancelAppointment(appointmentId, { reason })
 */
export const cancelAppointmentTool = {
  type: 'function' as const,
  function: {
    name: 'cancelAppointment',
    description: 'Cancel an existing appointment. Always confirm with the patient before canceling. Get the appointmentId from getAppointments first.',
    parameters: {
      type: 'object',
      properties: {
        appointmentId: {
          type: 'string',
          description: 'ID of the appointment to cancel (from getAppointments)',
        },
        reason: {
          type: 'string',
          description: 'Reason for cancellation. Ask the patient for a reason (optional but helpful for records).',
        },
      },
      required: ['appointmentId'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 20,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me cancel that appointment...',
    },
    {
      type: 'request-complete' as const,
      content: 'Your appointment has been cancelled.',
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble cancelling the appointment. Let me transfer you to our scheduling team.",
    },
  ],
};

/**
 * Get a patient's existing appointments.
 * 
 * Sikka API: GET /appointments?patientId=xxx
 * Backend: sikkaService.getAppointments({ patientId, startDate, endDate })
 * 
 * Essential for cancel/reschedule flows - the AI needs to know what appointments exist.
 */
export const getAppointmentsTool = {
  type: 'function' as const,
  function: {
    name: 'getAppointments',
    description: "Get a patient's upcoming appointments. Use this when a patient wants to cancel, reschedule, or check on their existing appointment. Returns appointment details including date, time, type, and provider.",
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Patient ID to look up appointments for (from searchPatients)',
        },
        startDate: {
          type: 'string',
          format: 'date',
          description: 'Start of date range to search (YYYY-MM-DD). Default: today.',
        },
        endDate: {
          type: 'string',
          format: 'date',
          description: 'End of date range to search (YYYY-MM-DD). Default: 90 days from today.',
        },
      },
      required: ['patientId'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 15,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me check your upcoming appointments...',
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble finding your appointments. Can you tell me more about which appointment you're referring to?",
    },
  ],
};

/**
 * Add a note to a patient's record.
 * 
 * Sikka API: POST /medical_notes
 * Backend: sikkaService.addPatientNote(patientId, { content, category })
 */
export const addPatientNoteTool = {
  type: 'function' as const,
  function: {
    name: 'addPatientNote',
    description: "Add a note to a patient's record. Use this to document important information from the call, such as concerns, preferences, allergies, or special requests.",
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Patient ID to add the note to',
        },
        content: {
          type: 'string',
          description: 'Note content - include all relevant details from the call: symptoms, concerns, preferences, special requests, accessibility needs, etc.',
        },
        category: {
          type: 'string',
          enum: ['preference', 'allergy', 'medical-history', 'call-summary', 'general'],
          description: 'Category for the note. Default: general',
        },
      },
      required: ['patientId', 'content'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 15,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: "I'm noting that in your file...",
    },
    {
      type: 'request-failed' as const,
      content: "I'll make sure our team gets that information.",
    },
  ],
};

/**
 * Get patient's insurance information.
 * 
 * Sikka API: GET /patients/{patientId}/insurance
 * Backend: sikkaService.getPatientInsurance(patientId)
 */
export const getPatientInsuranceTool = {
  type: 'function' as const,
  function: {
    name: 'getPatientInsurance',
    description: "Get a patient's insurance information on file.",
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Patient ID',
        },
      },
      required: ['patientId'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 15,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me check your insurance information...',
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble accessing insurance records right now.",
    },
  ],
};

/**
 * Get patient's account balance.
 * 
 * Sikka API: GET /patient_balance?patient_id={patientId}
 * Backend: sikkaService.getPatientBalance(patientId)
 */
export const getPatientBalanceTool = {
  type: 'function' as const,
  function: {
    name: 'getPatientBalance',
    description: "Check a patient's account balance.",
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Patient ID',
        },
      },
      required: ['patientId'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 15,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me check your account balance...',
    },
    {
      type: 'request-failed' as const,
      content: "I'm unable to pull up balance information right now. Our billing team can help with that.",
    },
  ],
};

/**
 * Get list of providers/dentists.
 * 
 * Sikka API: GET /providers
 * Backend: sikkaService.getProviders()
 */
export const getProvidersTool = {
  type: 'function' as const,
  function: {
    name: 'getProviders',
    description: 'Get the list of providers (dentists, hygienists) at the practice. Use when a patient asks about which providers are available or wants a specific provider.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 15,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me look up our providers...',
    },
  ],
};

// ============================================================================
// Grouped exports for different assistant types
// ============================================================================

/**
 * Core scheduling tools - used by the Scheduling assistant
 * Includes all patient and appointment management tools
 */
export const SCHEDULING_TOOLS = [
  searchPatientsTool,
  getPatientInfoTool,
  createPatientTool,
  updatePatientTool,
  checkAvailabilityTool,
  bookAppointmentTool,
  rescheduleAppointmentTool,
  cancelAppointmentTool,
  getAppointmentsTool,
  addPatientNoteTool,
  getProvidersTool,
];

/**
 * Emergency booking tools - subset for emergency assistant
 * Just enough to book an emergency appointment
 */
export const EMERGENCY_TOOLS = [
  searchPatientsTool,
  createPatientTool,
  bookAppointmentTool,
  checkAvailabilityTool,
];

/**
 * Clinic info tools - for the clinic information assistant
 * Patient lookup only (for directing to scheduling)
 */
export const CLINIC_INFO_TOOLS = [
  searchPatientsTool,
  getPatientInfoTool,
  getPatientInsuranceTool,
  getProvidersTool,
];

/**
 * All PMS tools combined
 */
export const PMS_TOOLS = [
  searchPatientsTool,
  getPatientInfoTool,
  createPatientTool,
  updatePatientTool,
  checkAvailabilityTool,
  bookAppointmentTool,
  rescheduleAppointmentTool,
  cancelAppointmentTool,
  getAppointmentsTool,
  addPatientNoteTool,
  getPatientInsuranceTool,
  getPatientBalanceTool,
  getProvidersTool,
];

/**
 * Helper function to add PMS tools to an assistant configuration
 */
export function addPmsToolsToAssistant(assistantConfig: any) {
  return {
    ...assistantConfig,
    tools: [...(assistantConfig.tools || []), ...PMS_TOOLS],
  };
}

/**
 * System prompt additions for PMS-enabled assistants
 * 
 * IMPORTANT: Uses caller's phone number from Vapi call metadata
 * ({{call.customer.number}}) for automatic patient lookup.
 * No need to ask for the phone number — Vapi provides it.
 */
export const PMS_SYSTEM_PROMPT_ADDITION = `
## PRACTICE MANAGEMENT SYSTEM ACCESS

You have access to the practice management system (Sikka) and can:
1. Search for patients by phone number, name, or email
2. Create new patient records
3. Check appointment availability by date
4. Book, reschedule, and cancel appointments
5. Look up existing appointments
6. Add notes to patient records
7. Check insurance and balance information
8. List providers

## CRITICAL: AUTOMATIC PATIENT IDENTIFICATION

The caller's phone number is automatically available from the call metadata: {{call.customer.number}}

**You do NOT need to ask for their phone number.** Use it immediately to search for them.

**Auto-identification flow:**
1. As soon as you start handling the call, call searchPatients with the caller's phone number ({{call.customer.number}})
2. If found: Greet them by name — "I see your record, [Name]. How can I help?"
3. If NOT found by phone: Ask for the name on their account and search again
4. If still NOT found: This is a new patient — collect first name, last name, and email, then use createPatient (phone is already known from {{call.customer.number}})

**Why auto-phone lookup:**
- The caller's phone number is already known — no need to ask
- Phone numbers are unique identifiers in Sikka
- This makes the experience faster and more professional
- If they're calling from a different number, they can tell you and you search by name instead

## APPOINTMENT BOOKING FLOW

1. **Auto-identify the patient** (search by {{call.customer.number}} immediately)
2. **Determine appointment need** — Ask what type of service they need
3. **Check availability** — Call checkAvailability with the requested date
4. **Present options** — Offer 2-3 time slots from the results
5. **Confirm details** — Read back: patient name, date, time, service type, provider
6. **Book** — Call bookAppointment with confirmed details
7. **Post-booking** — Confirm and add any call notes via addPatientNote

## CANCEL/RESCHEDULE FLOW

1. **Auto-identify the patient** (search by {{call.customer.number}})
2. **Find their appointment** — Call getAppointments with patientId
3. **Confirm which appointment** — If multiple, ask which one
4. **For cancel**: Call cancelAppointment, ask for reason, offer to reschedule
5. **For reschedule**: Check new availability, then call rescheduleAppointment

## NEW PATIENT FLOW

When searchPatients returns no results for the caller's phone:
1. Tell them: "I don't see an existing record with this number. Let me set one up for you."
2. Ask for: first name, last name (required), and email (recommended)
3. Call createPatient with their info — the phone number ({{call.customer.number}}) is already known
4. Continue with their appointment request

## DATA FORMATTING
- Dates: YYYY-MM-DD (e.g., 2026-02-20)
- Times: ISO 8601 (e.g., 2026-02-20T10:00:00Z)
- Duration: minutes (30, 60, 90)
- Phone: digits or +1XXXXXXXXXX format

## HIPAA & PRIVACY
- Never share patient information with unauthorized parties
- Only access records for the current caller
- Don't read back sensitive data like balance or full DOB unless the patient asks
- Note that all PMS access is HIPAA audit-logged

## GOOGLE CALENDAR FALLBACK

If the clinic does not have a PMS (Practice Management System) connected but has Google Calendar enabled:
- **Appointment booking, availability, cancel, reschedule, and lookup tools will automatically use Google Calendar** as the scheduling backend.
- The AI does **not** need to change its behavior — the same tools work seamlessly. The backend handles the fallback automatically.
- Patient-related tools (searchPatients, createPatient, getPatientInfo, addPatientNote) are **not available** without a PMS. In that case:
  - Collect the patient's name, phone, and email conversationally
  - Pass them directly as parameters to bookAppointment (firstName, lastName, phone, email)
  - The appointment will be saved to Google Calendar with patient details in the event description
- If the tool response includes "integrationType": "google_calendar", you know it was handled via Calendar rather than PMS

## ERROR HANDLING
- If a tool call fails, apologize and try an alternative approach
- If PMS is down, offer to take information manually for callback
- If neither PMS nor Google Calendar is connected, inform the caller that scheduling is not set up and offer to take a message
- Never leave the patient without a resolution path
`;
