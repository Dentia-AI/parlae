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
    description: 'Check available appointment time slots starting from a specific date. If no slots are available on the requested date, the system automatically searches ahead and returns the 2-3 nearest available slots across the next 14 days. Always present the returned slots to the caller — do NOT call this tool again with another date unless the caller rejects all offered options.',
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
    timeoutSeconds: 30,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me check our available times...',
    },
    {
      type: 'request-response-delayed' as const,
      content: "I'm searching for the best available times for you, just a moment...",
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
// Insurance Tools
// ============================================================================

/**
 * Add insurance information to a patient record.
 *
 * Backend: sikkaService.addPatientInsurance(patientId, insuranceData)
 *
 * Used by the Insurance assistant when a patient provides new insurance info.
 */
export const addPatientInsuranceTool = {
  type: 'function' as const,
  function: {
    name: 'addPatientInsurance',
    description: 'Add insurance information to a patient record. Requires the patient ID and insurance details. Use when a patient provides new insurance they want on file.',
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'The patient ID from a previous searchPatients call.',
        },
        insuranceProvider: {
          type: 'string',
          description: 'Insurance company/provider name (e.g., Blue Cross Blue Shield, Aetna, Cigna).',
        },
        memberId: {
          type: 'string',
          description: 'Insurance member/subscriber ID number.',
        },
        groupNumber: {
          type: 'string',
          description: 'Insurance group number (if applicable).',
        },
        subscriberName: {
          type: 'string',
          description: 'Name of the primary subscriber (if different from patient).',
        },
        subscriberRelationship: {
          type: 'string',
          enum: ['self', 'spouse', 'child', 'other'],
          description: 'Relationship of the patient to the primary subscriber.',
        },
        isPrimary: {
          type: 'boolean',
          description: 'Whether this is the primary insurance. Default: true.',
        },
      },
      required: ['patientId', 'insuranceProvider', 'memberId'],
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
      content: 'Let me add that insurance information to your record...',
    },
    {
      type: 'request-response-delayed' as const,
      content: 'Still updating, one moment...',
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble saving your insurance information right now. Our team will follow up to make sure it's on file.",
    },
  ],
};

/**
 * Update existing insurance information for a patient.
 *
 * Backend: sikkaService.updatePatientInsurance(patientId, insuranceId, updates)
 */
export const updatePatientInsuranceTool = {
  type: 'function' as const,
  function: {
    name: 'updatePatientInsurance',
    description: 'Update existing insurance information for a patient. Use when a patient needs to change their insurance provider, update their member ID, or correct insurance details.',
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'The patient ID.',
        },
        insuranceId: {
          type: 'string',
          description: 'The insurance record ID to update (from getPatientInsurance results).',
        },
        insuranceProvider: {
          type: 'string',
          description: 'Updated insurance company name.',
        },
        memberId: {
          type: 'string',
          description: 'Updated member/subscriber ID.',
        },
        groupNumber: {
          type: 'string',
          description: 'Updated group number.',
        },
        subscriberName: {
          type: 'string',
          description: 'Updated subscriber name.',
        },
        subscriberRelationship: {
          type: 'string',
          enum: ['self', 'spouse', 'child', 'other'],
          description: 'Updated relationship to subscriber.',
        },
        isActive: {
          type: 'boolean',
          description: 'Set to false to deactivate insurance (e.g., expired coverage).',
        },
      },
      required: ['patientId', 'insuranceId'],
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
      content: 'Updating your insurance information...',
    },
    {
      type: 'request-failed' as const,
      content: "I wasn't able to update that right now. Our team will follow up.",
    },
  ],
};

/**
 * Verify insurance coverage and eligibility for a patient.
 *
 * Backend: sikkaService.verifyInsuranceCoverage(patientId, options)
 *
 * NOTE: This may not be available for all PMS systems. The backend will
 * return an appropriate message if the feature is not supported.
 */
export const verifyInsuranceCoverageTool = {
  type: 'function' as const,
  function: {
    name: 'verifyInsuranceCoverage',
    description: 'Verify insurance coverage and eligibility for a patient. Checks whether their insurance is active, what services are covered, copay amounts, and remaining benefits. May not be available for all insurance providers.',
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'The patient ID.',
        },
        serviceType: {
          type: 'string',
          enum: ['preventive', 'basic', 'major', 'orthodontic', 'emergency', 'general'],
          description: 'Type of service to check coverage for. Use "general" for overall eligibility check.',
        },
        dateOfService: {
          type: 'string',
          description: 'Date to check coverage for (YYYY-MM-DD). Defaults to today.',
        },
      },
      required: ['patientId'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 30,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Let me verify your insurance coverage... this may take a moment.',
    },
    {
      type: 'request-response-delayed' as const,
      content: 'Still checking with your insurance provider...',
    },
    {
      type: 'request-failed' as const,
      content: "I wasn't able to verify coverage electronically right now. Our billing team can check this for you and call you back.",
    },
  ],
};

// ============================================================================
// Payment & Billing Tools
// ============================================================================

/**
 * Get payment history for a patient.
 *
 * Backend: sikkaService.getPaymentHistory(patientId, options)
 */
export const getPaymentHistoryTool = {
  type: 'function' as const,
  function: {
    name: 'getPaymentHistory',
    description: 'Get payment history for a patient. Shows past payments, dates, amounts, and payment methods. Use when a patient asks about past payments or needs a receipt.',
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'The patient ID.',
        },
        startDate: {
          type: 'string',
          description: 'Start date for payment history (YYYY-MM-DD). Defaults to 12 months ago.',
        },
        endDate: {
          type: 'string',
          description: 'End date for payment history (YYYY-MM-DD). Defaults to today.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of records. Default: 10.',
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
      content: 'Let me pull up your payment history...',
    },
    {
      type: 'request-failed' as const,
      content: "I'm having trouble accessing payment records right now. Our billing team can help you with that.",
    },
  ],
};

/**
 * Process a payment from a patient.
 *
 * Backend: paymentService.processPayment(patientId, paymentData)
 *
 * IMPORTANT: This is a sensitive operation. The AI should always confirm
 * the amount before processing and never store card details in logs.
 */
export const processPaymentTool = {
  type: 'function' as const,
  function: {
    name: 'processPayment',
    description: 'Process a payment from a patient. Handles payments for outstanding balances, copays, or treatment costs. Always confirm the amount with the patient before calling this tool. Card details are handled securely and never logged.',
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'The patient ID.',
        },
        amount: {
          type: 'number',
          description: 'Payment amount in dollars (e.g., 150.00).',
        },
        paymentMethod: {
          type: 'string',
          enum: ['card_on_file', 'new_card', 'bank_transfer', 'payment_link'],
          description: 'How the patient wants to pay. Use "payment_link" to send a secure link via SMS/email. Use "card_on_file" if they have a card saved.',
        },
        description: {
          type: 'string',
          description: 'What the payment is for (e.g., "copay for cleaning", "outstanding balance").',
        },
        invoiceId: {
          type: 'string',
          description: 'Invoice/charge ID if paying a specific invoice.',
        },
      },
      required: ['patientId', 'amount', 'paymentMethod'],
    },
  },
  async: false,
  server: {
    url: WEBHOOK_URL,
    secret: WEBHOOK_SECRET,
    timeoutSeconds: 30,
  },
  messages: [
    {
      type: 'request-start' as const,
      content: 'Processing your payment now...',
    },
    {
      type: 'request-response-delayed' as const,
      content: 'Still processing, please hold...',
    },
    {
      type: 'request-failed' as const,
      content: "I wasn't able to process that payment right now. I can send you a secure payment link instead, or our billing team can assist you.",
    },
  ],
};

/**
 * Create a payment plan for a patient with an outstanding balance.
 *
 * Backend: paymentService.createPaymentPlan(patientId, planData)
 */
export const createPaymentPlanTool = {
  type: 'function' as const,
  function: {
    name: 'createPaymentPlan',
    description: 'Set up a payment plan for a patient with an outstanding balance. Creates a structured plan with monthly payments. Use when a patient cannot pay the full amount at once.',
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'The patient ID.',
        },
        totalAmount: {
          type: 'number',
          description: 'Total amount to be paid over the plan.',
        },
        numberOfPayments: {
          type: 'number',
          description: 'Number of monthly installments (e.g., 3, 6, 12).',
        },
        startDate: {
          type: 'string',
          description: 'When the first payment is due (YYYY-MM-DD). Defaults to today.',
        },
        downPayment: {
          type: 'number',
          description: 'Initial down payment amount, if any.',
        },
      },
      required: ['patientId', 'totalAmount', 'numberOfPayments'],
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
      content: 'Setting up your payment plan...',
    },
    {
      type: 'request-failed' as const,
      content: "I wasn't able to set up the payment plan right now. Our billing team will reach out to finalize the details.",
    },
  ],
};

// ============================================================================
// Grouped exports for different assistant types
// ============================================================================

/**
 * Scheduling tools - focused on appointment management
 *
 * The Scheduling assistant handles booking, cancel, reschedule only.
 * Patient record management is handled by the Patient Records assistant.
 */
export const SCHEDULING_TOOLS = [
  searchPatientsTool,
  createPatientTool,
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
 * General clinic/patient lookup (not for updates)
 */
export const CLINIC_INFO_TOOLS = [
  searchPatientsTool,
  getPatientInfoTool,
  getProvidersTool,
];

/**
 * Patient Records tools - for the Patient Records assistant
 * Handles patient data queries and updates (HIPAA-sensitive health data)
 */
export const PATIENT_RECORDS_TOOLS = [
  searchPatientsTool,
  getPatientInfoTool,
  createPatientTool,
  updatePatientTool,
  addPatientNoteTool,
];

/**
 * Insurance tools - for the Insurance assistant
 * Handles insurance queries, add/update, and coverage verification
 */
export const INSURANCE_TOOLS = [
  searchPatientsTool,
  getPatientInsuranceTool,
  addPatientInsuranceTool,
  updatePatientInsuranceTool,
  verifyInsuranceCoverageTool,
];

/**
 * Payment & Billing tools - for the Payment assistant
 * Handles balance inquiries, payment processing, and payment plans
 */
export const PAYMENT_TOOLS = [
  searchPatientsTool,
  getPatientBalanceTool,
  getPaymentHistoryTool,
  processPaymentTool,
  createPaymentPlanTool,
];

/**
 * All PMS tools combined (deduplicated)
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
  // Insurance management
  addPatientInsuranceTool,
  updatePatientInsuranceTool,
  verifyInsuranceCoverageTool,
  // Payment & billing
  getPaymentHistoryTool,
  processPaymentTool,
  createPaymentPlanTool,
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

You have access to the following scheduling tools (use exact names):
- **searchPatients** — Find patient by phone, name, or email
- **createPatient** — Create a new patient record
- **checkAvailability** — Check available slots (auto-finds nearest openings if requested date is full)
- **bookAppointment** — Book an appointment
- **rescheduleAppointment** — Change an existing appointment time
- **cancelAppointment** — Cancel an appointment
- **getAppointments** — Look up existing appointments
- **addPatientNote** — Add notes to the patient's record
- **getProviders** — List available providers and specialties

Note: Insurance, billing, and patient record updates are handled by separate specialists.
If the caller asks about those, transfer them to the appropriate assistant.

## CRITICAL: AUTOMATIC PATIENT IDENTIFICATION

The caller's phone number is automatically available from the call metadata.
**You do NOT need to ask for their phone number.** Use it immediately to search for them.

**Auto-identification flow:**
1. Immediately call **searchPatients** with the caller's phone number as the query
2. If found: Greet them by name — "I see your record, [Name]. How can I help?"
3. If NOT found by phone: Ask for the name and search again
4. If still NOT found: New patient — collect first name, last name, and email, then call **createPatient** (phone already known)

**IMPORTANT**: When calling tools, use the actual phone number value, NOT template syntax. The caller's number is resolved from call metadata automatically.

## APPOINTMENT BOOKING FLOW

1. **Auto-identify** — call **searchPatients** with the caller's phone number immediately
2. **Determine need** — Ask what type of service they need
3. **Check availability** — Call **checkAvailability** with the requested date (use today's actual date in YYYY-MM-DD format, NOT a made-up date). If that date is full, the system **automatically returns the 2-3 nearest available slots** across the next 14 days — present those to the caller instead of calling the tool again.
4. **Present options** — Offer the returned time slots. Only call checkAvailability again if the caller rejects ALL offered options and asks for a specific different date.
5. **Confirm details** — Read back: patient name, date, time, service type, provider
6. **Book** — Call **bookAppointment** with confirmed details
7. **Post-booking** — Confirm and add call notes via **addPatientNote**

## CANCEL/RESCHEDULE FLOW

1. **Auto-identify** — call **searchPatients** with the caller's phone number
2. **Find appointment** — Call **getAppointments** with patientId
3. **Confirm which** — If multiple, ask which one
4. **For cancel**: Call **cancelAppointment**, ask for reason, offer to reschedule
5. **For reschedule**: Call **checkAvailability**, then **rescheduleAppointment**

## NEW PATIENT FLOW

When **searchPatients** returns no results:
1. "I don't see an existing record with this number. Let me set one up for you."
2. Ask for: first name, last name (required), and email (recommended)
3. Call **createPatient** — the phone number is already known from call metadata
4. **IMPORTANT: Immediately continue with their appointment request — do NOT pause or wait for the caller to say something after creating the profile. Ask about their appointment need in the same response.**

## DATA FORMATTING
- Dates: Use today's actual date for same-day requests. Always use YYYY-MM-DD format (e.g., 2026-02-17)
- Times: ISO 8601 (e.g., 2026-02-17T10:00:00Z)
- Duration: minutes (30, 60, 90)
- Phone: digits or +1XXXXXXXXXX format
- **NEVER use a made-up or example date** — always use the real current date or the date the caller requests

## HIPAA & PRIVACY
- Never share patient information with unauthorized parties
- Only access records for the current caller
- Don't read back sensitive data unless the patient asks
- All PMS access is HIPAA audit-logged

## GOOGLE CALENDAR MODE

All scheduling tools (searchPatients, createPatient, checkAvailability, bookAppointment) work in both PMS and Google Calendar mode — the backend handles the routing automatically.

When running in Google Calendar mode:
- **searchPatients** will return no results (no patient database) — this is expected
- **createPatient** will note the patient info and return success — proceed to booking
- **bookAppointment** will create a Google Calendar event with all patient details in the event notes
- **checkAvailability** will check the Google Calendar free/busy schedule. If the requested date is full, it automatically scans ahead up to 14 days and returns the 2-3 nearest available slots. Present those options to the caller — do NOT call checkAvailability again unless the caller rejects all options.
- Always include firstName, lastName, phone, and any notes when calling **bookAppointment** so the details appear in the calendar event

## ERROR HANDLING
- If a tool call fails, apologize and try an alternative approach
- If scheduling system is down, offer to take information manually for callback
- If neither PMS nor Google Calendar is connected, offer to take a message
- Never leave the patient without a resolution path
`;
