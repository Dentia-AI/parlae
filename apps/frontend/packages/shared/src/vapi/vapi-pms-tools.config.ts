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
 * Look up a patient by phone number, name, or email.
 *
 * v4.0: Replaces both `searchPatients` and `getPatientInfo`.
 * The backend verifies the caller's phone against the patient record
 * and filters sensitive fields accordingly (HIPAA).
 *
 * Backend: routes to lookupPatient handler (also accepts searchPatients / getPatientInfo)
 */
export const lookupPatientTool = {
  type: 'function' as const,
  function: {
    name: 'lookupPatient',
    description: "Look up the caller's patient record. Use the caller's phone number ({{call.customer.number}}) as the query — this is the most reliable identifier and verifies the caller's identity. The backend checks the caller's phone against the record and only returns full details if they match. If identity cannot be verified, you will be prompted to ask for date of birth.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: "Search term: caller's phone number (strongly preferred), patient name, or email. Always try the caller's phone number first.",
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

/** @deprecated v3.x alias — use lookupPatientTool instead */
export const searchPatientsTool = lookupPatientTool;
/** @deprecated v3.x alias — use lookupPatientTool instead */
export const getPatientInfoTool = lookupPatientTool;

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
    description: 'Create a new patient record. Use when searchPatients returns no results. REQUIRED: firstName, lastName, phone. STRONGLY RECOMMENDED: email (needed for appointment confirmations). Always collect email before calling this tool.',
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
          description: "Patient's email address — REQUIRED for new patients. Must be collected and spelled out before calling this tool.",
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
      required: ['firstName', 'lastName', 'phone', 'email'],
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
    description: 'Check available appointment time slots starting from a specific date. Current date/time: {{now}}. Only use dates from today onwards — NEVER use dates from 2023/2024/2025. If no slots are available on the requested date, the system automatically searches ahead and returns the 2-3 nearest available slots across the next 14 days. Always present the returned slots to the caller — do NOT call this tool again with another date unless the caller rejects all offered options.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          format: 'date',
          description: 'Date to check availability (YYYY-MM-DD format). Must be today or a future date. Current date/time is {{now}}.',
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
    description: 'Book an appointment for a patient. You must have the patientId from searchPatients or createPatient before booking. Always check availability first. ALWAYS include firstName, lastName, email, and phone — these are needed for calendar invitations and confirmations.',
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Patient ID from the PMS (obtained via searchPatients or createPatient). REQUIRED.',
        },
        firstName: {
          type: 'string',
          description: "Patient's first name. Always include.",
        },
        lastName: {
          type: 'string',
          description: "Patient's last name. Always include.",
        },
        email: {
          type: 'string',
          description: "Patient's email address. Always include — needed for calendar invitation.",
        },
        phone: {
          type: 'string',
          description: "Patient's phone number. Use the caller's number from the call.",
        },
        providerId: {
          type: 'string',
          description: 'Provider/dentist ID for the appointment (from checkAvailability results or patient preference). Optional.',
        },
        appointmentType: {
          type: 'string',
          description: 'Type of appointment: cleaning, exam, filling, root-canal, extraction, consultation, emergency, cosmetic. REQUIRED.',
        },
        startTime: {
          type: 'string',
          format: 'date-time',
          description: 'Appointment start time in ISO 8601 format using the clinic local time. Example: 2026-02-20T10:00:00. REQUIRED.',
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
      required: ['patientId', 'appointmentType', 'startTime', 'duration', 'firstName', 'lastName', 'email', 'phone'],
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
 *
 * v4.0: Renamed from addPatientNote → addNote (shorter, unambiguous).
 */
export const addNoteTool = {
  type: 'function' as const,
  function: {
    name: 'addNote',
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

/** @deprecated v3.x alias — use addNoteTool instead */
export const addPatientNoteTool = addNoteTool;

/**
 * Get patient's insurance information.
 * 
 * Sikka API: GET /patients/{patientId}/insurance
 * Backend: sikkaService.getPatientInsurance(patientId)
 *
 * v4.0: Renamed from getPatientInsurance → getInsurance.
 */
export const getInsuranceTool = {
  type: 'function' as const,
  function: {
    name: 'getInsurance',
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

/** @deprecated v3.x alias — use getInsuranceTool instead */
export const getPatientInsuranceTool = getInsuranceTool;

/**
 * Get patient's account balance.
 * 
 * Sikka API: GET /patient_balance?patient_id={patientId}
 * Backend: sikkaService.getPatientBalance(patientId)
 *
 * v4.0: Renamed from getPatientBalance → getBalance.
 */
export const getBalanceTool = {
  type: 'function' as const,
  function: {
    name: 'getBalance',
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

/** @deprecated v3.x alias — use getBalanceTool instead */
export const getPatientBalanceTool = getBalanceTool;

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
 * Save (add or update) insurance information for a patient.
 *
 * v4.0: Merges addPatientInsurance + updatePatientInsurance into a single tool.
 * The backend detects whether to create or update based on the presence of insuranceId.
 *
 * Backend: routes to saveInsurance handler (also accepts addPatientInsurance / updatePatientInsurance)
 */
export const saveInsuranceTool = {
  type: 'function' as const,
  function: {
    name: 'saveInsurance',
    description: "Add or update insurance information for a patient. If the patient already has insurance on file (you have an insuranceId), it will update the existing record. Otherwise it creates a new one. Use this whenever a patient provides or changes their insurance details.",
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'The patient ID.',
        },
        insuranceId: {
          type: 'string',
          description: 'The existing insurance record ID (from getInsurance results). Omit when adding new insurance.',
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
        isActive: {
          type: 'boolean',
          description: 'Set to false to deactivate insurance (e.g., expired coverage).',
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
      content: 'Saving your insurance information...',
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

/** @deprecated v3.x alias — use saveInsuranceTool instead */
export const addPatientInsuranceTool = saveInsuranceTool;
/** @deprecated v3.x alias — use saveInsuranceTool instead */
export const updatePatientInsuranceTool = saveInsuranceTool;

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
  lookupPatientTool,
  createPatientTool,
  updatePatientTool,
  addNoteTool,
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

// ============================================================================
// v4.0 Tool Groups — Focused sets for the restructured squad
// ============================================================================

/**
 * Booking Agent tools — new appointment booking only (4 tools)
 */
export const BOOKING_TOOLS = [
  lookupPatientTool,
  createPatientTool,
  checkAvailabilityTool,
  bookAppointmentTool,
];

/**
 * Appointment Management tools — cancel, reschedule, lookup (4 tools)
 */
export const APPOINTMENT_MGMT_TOOLS = [
  lookupPatientTool,
  getAppointmentsTool,
  rescheduleAppointmentTool,
  cancelAppointmentTool,
];

/**
 * Receptionist tools — general info, no patient-sensitive ops (1 tool + KB at runtime)
 */
export const RECEPTIONIST_TOOLS = [
  getProvidersTool,
];

/**
 * Insurance & Billing tools — combined coverage + payment (5 tools)
 */
export const INSURANCE_BILLING_TOOLS = [
  lookupPatientTool,
  getInsuranceTool,
  verifyInsuranceCoverageTool,
  getBalanceTool,
  processPaymentTool,
];

// ============================================================================
// Legacy tool groups (v3.x) — kept for backward compatibility
// ============================================================================

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
## DATA FORMATTING
- Dates: Always use YYYY-MM-DD format (e.g., 2026-02-17). Use today's actual date for same-day requests.
- Times: ISO 8601 (e.g., 2026-02-17T10:00:00Z)
- Duration: minutes (30, 60, 90)
- Phone: digits or +1XXXXXXXXXX format
- **NEVER use a made-up or example date** — always use the real current date or the date the caller requests

## HIPAA & PRIVACY
- The **lookupPatient** tool verifies the caller automatically by matching their phone number. Check the \`callerVerified\` field in the response.
- If \`callerVerified: false\`, ask the caller to confirm their date of birth before sharing any details.
- If \`familyAccount: true\`, ask which family member they are calling about before proceeding.
- Never share patient information with unauthorized parties
- Don't read back sensitive data (DOB, balance, insurance) unless the patient asks
- Do NOT provide medical advice, diagnoses, or treatment recommendations. If asked, say: "That's a great question for your dentist. I can help you schedule an appointment to discuss that."
- If a balance is returned, state the amount without commenting on whether it's high or low.
- All PMS access is HIPAA audit-logged
`;
