/**
 * Retell AI PMS Tools Configuration
 *
 * Maps the same PMS tools from vapi-pms-tools.config.ts to Retell's CustomTool format.
 * Tool parameters and descriptions are identical — only the wrapper format differs.
 *
 * Retell custom tools send POST requests directly to each tool's URL with:
 *   { call: { call_id, agent_id, metadata }, args: { ...params } }
 *
 * IMPORTANT: Placeholder values {{webhookUrl}}, {{secret}}, {{accountId}} are
 * replaced at deployment time by retell-template-utils.ts.
 */

import type { RetellCustomTool } from './retell.service';

// ---------------------------------------------------------------------------
// Helper to build a Retell custom tool from the Vapi tool shape
// ---------------------------------------------------------------------------

interface VapiToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

function toRetellTool(
  fn: VapiToolFunction,
  opts: {
    speakDuring?: boolean;
    speakDuringMessage?: string;
    /** 'static_text' speaks the message verbatim (faster, no LLM call).
     *  'prompt' lets the AI generate a message (slower, more varied). */
    speakDuringType?: 'prompt' | 'static_text';
    timeoutMs?: number;
    responseVariables?: Record<string, string>;
  } = {},
): RetellCustomTool {
  return {
    type: 'custom',
    name: fn.name,
    url: `{{webhookUrl}}/retell/tools/${fn.name}`,
    description: fn.description.replace(/\{\{call\.customer\.number\}\}/g, '{{customer_phone}}'),
    method: 'POST',
    headers: {
      'x-retell-secret': '{{secret}}',
      'x-account-id': '{{accountId}}',
    },
    parameters: fn.parameters,
    speak_during_execution: opts.speakDuring ?? false,
    speak_after_execution: true,
    execution_message_description: opts.speakDuringMessage,
    execution_message_type: opts.speakDuringType ?? 'static_text',
    timeout_ms: opts.timeoutMs ?? 30_000,
    ...(opts.responseVariables ? { response_variables: opts.responseVariables } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tool Definitions (parameter schemas match Vapi tools exactly)
// ---------------------------------------------------------------------------

const lookupPatientFn: VapiToolFunction = {
  name: 'lookupPatient',
  description:
    "Look up the caller's patient record. Always provide BOTH phone and name when known — the system will search by each and return the best match. When the caller provides a phone number, read it back digit by digit to confirm before searching.",
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          "Primary search term: caller's phone number ({{customer_phone}}), patient name, or email.",
      },
      phone: {
        type: 'string',
        description:
          "Patient's phone number, if known. Provide alongside name for best results.",
      },
      name: {
        type: 'string',
        description:
          "Patient's full name (first and last), if known. Provide alongside phone for best results.",
      },
    },
    required: ['query'],
  },
};

const createPatientFn: VapiToolFunction = {
  name: 'createPatient',
  description:
    'Create a new patient record. Use when lookupPatient returns no results. REQUIRED: firstName, lastName, phone. STRONGLY RECOMMENDED: email.',
  parameters: {
    type: 'object',
    properties: {
      firstName: { type: 'string', description: "Patient's first name" },
      lastName: { type: 'string', description: "Patient's last name" },
      phone: { type: 'string', description: "Patient's phone number" },
      email: { type: 'string', description: "Patient's email address" },
      dateOfBirth: { type: 'string', description: 'Date of birth (YYYY-MM-DD)' },
      address: { type: 'string', description: "Patient's address" },
      notes: { type: 'string', description: 'Additional notes about the patient' },
    },
    required: ['firstName', 'lastName', 'phone'],
  },
};

const updatePatientFn: VapiToolFunction = {
  name: 'updatePatient',
  description:
    'Update an existing patient record. Requires patientId from a previous lookupPatient call. Only include fields that need updating.',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient ID from lookupPatient' },
      firstName: { type: 'string', description: 'Updated first name' },
      lastName: { type: 'string', description: 'Updated last name' },
      phone: { type: 'string', description: 'Updated phone number' },
      email: { type: 'string', description: 'Updated email address' },
      dateOfBirth: { type: 'string', description: 'Updated date of birth (YYYY-MM-DD)' },
      address: { type: 'string', description: 'Updated address' },
    },
    required: ['patientId'],
  },
};

const checkAvailabilityFn: VapiToolFunction = {
  name: 'checkAvailability',
  description:
    'Check available appointment slots for a specific date. Returns time slots with provider info. Date format: YYYY-MM-DD. If caller says "tomorrow" or "next Monday", calculate the actual date.',
  parameters: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: "Date to check availability for (YYYY-MM-DD). Calculate from relative terms like 'tomorrow'.",
      },
      appointmentType: {
        type: 'string',
        description: 'Type of appointment: cleaning, exam, consultation, emergency, root-canal, filling, crown, extraction, whitening, other',
      },
    },
    required: ['date'],
  },
};

const bookAppointmentFn: VapiToolFunction = {
  name: 'bookAppointment',
  description:
    'Book an appointment. For existing patients pass patientId. For new patients pass firstName, lastName, phone instead — the system registers them automatically.',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient ID from lookupPatient (omit for new patients)' },
      firstName: { type: 'string', description: "New patient's first name (required if no patientId)" },
      lastName: { type: 'string', description: "New patient's last name (required if no patientId)" },
      phone: { type: 'string', description: "New patient's phone number (required if no patientId)" },
      email: { type: 'string', description: "New patient's email address" },
      dateOfBirth: { type: 'string', description: 'Date of birth (YYYY-MM-DD)' },
      date: { type: 'string', description: 'Appointment date (YYYY-MM-DD)' },
      startTime: { type: 'string', description: 'Start time in 24h format (HH:MM)' },
      appointmentType: {
        type: 'string',
        description: 'Type: cleaning, exam, consultation, emergency, root-canal, filling, crown, extraction, whitening, other',
      },
      providerId: { type: 'string', description: 'Provider/dentist ID (optional)' },
      notes: { type: 'string', description: 'Special notes for the appointment' },
    },
    required: ['date', 'startTime', 'appointmentType'],
  },
};

const rescheduleAppointmentFn: VapiToolFunction = {
  name: 'rescheduleAppointment',
  description:
    'Reschedule an existing appointment. Requires appointmentId (from getAppointments) and new date/time.',
  parameters: {
    type: 'object',
    properties: {
      appointmentId: { type: 'string', description: 'Appointment ID from getAppointments' },
      newDate: { type: 'string', description: 'New appointment date (YYYY-MM-DD)' },
      newStartTime: { type: 'string', description: 'New start time in 24h format (HH:MM)' },
      reason: { type: 'string', description: 'Reason for rescheduling' },
    },
    required: ['appointmentId', 'newDate', 'newStartTime'],
  },
};

const cancelAppointmentFn: VapiToolFunction = {
  name: 'cancelAppointment',
  description:
    'Cancel an existing appointment. Requires appointmentId from getAppointments. Always confirm with the caller before cancelling.',
  parameters: {
    type: 'object',
    properties: {
      appointmentId: { type: 'string', description: 'Appointment ID from getAppointments' },
      reason: { type: 'string', description: 'Reason for cancellation' },
    },
    required: ['appointmentId'],
  },
};

const getAppointmentsFn: VapiToolFunction = {
  name: 'getAppointments',
  description:
    "Look up a patient's existing appointments. Use before cancel or reschedule to get the appointmentId.",
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient ID from lookupPatient' },
      dateFrom: { type: 'string', description: 'Start date filter (YYYY-MM-DD), defaults to today' },
      dateTo: { type: 'string', description: 'End date filter (YYYY-MM-DD), defaults to 90 days out' },
    },
    required: ['patientId'],
  },
};

const addNoteFn: VapiToolFunction = {
  name: 'addNote',
  description: "Add a note to a patient's record. Requires patientId and note text.",
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient ID from lookupPatient' },
      note: { type: 'string', description: 'Note text to add' },
      category: { type: 'string', description: "Note category: 'general', 'clinical', 'billing', 'insurance'" },
    },
    required: ['patientId', 'note'],
  },
};

const getInsuranceFn: VapiToolFunction = {
  name: 'getInsurance',
  description: "Get a patient's insurance information on file.",
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient ID from lookupPatient' },
    },
    required: ['patientId'],
  },
};

const saveInsuranceFn: VapiToolFunction = {
  name: 'saveInsurance',
  description: "Add or update a patient's insurance information.",
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient ID' },
      insuranceProvider: { type: 'string', description: 'Insurance company name' },
      policyNumber: { type: 'string', description: 'Policy or member number' },
      groupNumber: { type: 'string', description: 'Group number' },
      subscriberName: { type: 'string', description: 'Name of the policy holder' },
      subscriberDob: { type: 'string', description: 'Policy holder date of birth (YYYY-MM-DD)' },
      relationship: { type: 'string', description: "Relationship to subscriber: 'self', 'spouse', 'child', 'other'" },
    },
    required: ['patientId', 'insuranceProvider', 'policyNumber'],
  },
};

const verifyInsuranceCoverageFn: VapiToolFunction = {
  name: 'verifyInsuranceCoverage',
  description: 'Verify insurance coverage for a specific procedure.',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient ID' },
      procedureCode: { type: 'string', description: 'Dental procedure code (e.g. D1110)' },
      procedureDescription: { type: 'string', description: 'Human-readable procedure description' },
    },
    required: ['patientId'],
  },
};

const getBalanceFn: VapiToolFunction = {
  name: 'getBalance',
  description: "Get a patient's current balance and outstanding charges.",
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient ID from lookupPatient' },
    },
    required: ['patientId'],
  },
};

const getPaymentHistoryFn: VapiToolFunction = {
  name: 'getPaymentHistory',
  description: "Get a patient's payment history.",
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient ID' },
      limit: { type: 'number', description: 'Max number of records to return (default 10)' },
    },
    required: ['patientId'],
  },
};

const processPaymentFn: VapiToolFunction = {
  name: 'processPayment',
  description: 'Process a payment for a patient. Requires patientId and amount.',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient ID' },
      amount: { type: 'number', description: 'Payment amount in dollars' },
      paymentMethod: { type: 'string', description: "Payment method: 'card_on_file', 'new_card', 'insurance'" },
      notes: { type: 'string', description: 'Payment notes' },
    },
    required: ['patientId', 'amount'],
  },
};

const createPaymentPlanFn: VapiToolFunction = {
  name: 'createPaymentPlan',
  description: 'Create a payment plan for a patient.',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient ID' },
      totalAmount: { type: 'number', description: 'Total amount for the plan' },
      numberOfPayments: { type: 'number', description: 'Number of installments' },
      frequency: { type: 'string', description: "Payment frequency: 'weekly', 'biweekly', 'monthly'" },
      startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    },
    required: ['patientId', 'totalAmount', 'numberOfPayments'],
  },
};

const takeMessageFn: VapiToolFunction = {
  name: 'takeMessage',
  description:
    'Take a message from the caller when a transfer failed or no staff is available. Collects caller info and notifies the clinic via SMS and email so they can follow up.',
  parameters: {
    type: 'object',
    properties: {
      callerName: { type: 'string', description: "Caller's full name" },
      callerPhone: {
        type: 'string',
        description: "Caller's phone number (use {{customer_phone}} if available)",
      },
      reason: { type: 'string', description: 'Why the caller is calling and what they need' },
      urgency: {
        type: 'string',
        description: "Urgency level: 'urgent', 'normal', or 'low'",
      },
      notes: { type: 'string', description: 'Any additional details the caller provided' },
    },
    required: ['reason'],
  },
};

const getProvidersFn: VapiToolFunction = {
  name: 'getProviders',
  description: 'Get list of dentists/providers at the clinic.',
  parameters: {
    type: 'object',
    properties: {},
  },
};

// ---------------------------------------------------------------------------
// Exported Retell Tool Definitions
// ---------------------------------------------------------------------------

// All tools use speak_during_execution so the caller hears a short filler
// while waiting. The backend pads fast responses so the filler always
// finishes before the result arrives (no mid-word cutoff).
// Short fillers (~0.6-0.8s speech) for read/lookup tools.
export const retellLookupPatientTool = toRetellTool(lookupPatientFn, {
  speakDuring: true,
  speakDuringMessage: 'One moment.',
});
export const retellCreatePatientTool = toRetellTool(createPatientFn, {
  speakDuring: true,
  speakDuringMessage: 'One moment.',
});
export const retellUpdatePatientTool = toRetellTool(updatePatientFn, {
  speakDuring: true,
  speakDuringMessage: 'One moment.',
});
export const retellCheckAvailabilityTool = toRetellTool(checkAvailabilityFn, {
  speakDuring: true,
  speakDuringMessage: 'Let me check.',
  responseVariables: {
    avail_success: 'result.success',
    avail_message: 'result.message',
  },
});
export const retellGetAppointmentsTool = toRetellTool(getAppointmentsFn, {
  speakDuring: true,
  speakDuringMessage: 'One moment.',
  responseVariables: {
    appts_found: 'result.success',
  },
});
export const retellAddNoteTool = toRetellTool(addNoteFn);
export const retellGetInsuranceTool = toRetellTool(getInsuranceFn, {
  speakDuring: true,
  speakDuringMessage: 'One moment.',
});
export const retellGetBalanceTool = toRetellTool(getBalanceFn, {
  speakDuring: true,
  speakDuringMessage: 'One moment.',
});
export const retellGetPaymentHistoryTool = toRetellTool(getPaymentHistoryFn);
export const retellVerifyInsuranceCoverageTool = toRetellTool(verifyInsuranceCoverageFn, {
  speakDuring: true,
  speakDuringMessage: 'Let me check.',
});

// Longer fillers (~1.2-1.5s speech) for slow writeback tools.
export const retellBookAppointmentTool = toRetellTool(bookAppointmentFn, {
  speakDuring: true,
  speakDuringMessage: 'Let me get that booked for you.',
  timeoutMs: 45_000,
  responseVariables: {
    book_success: 'result.success',
    book_message: 'result.message',
  },
});
export const retellRescheduleAppointmentTool = toRetellTool(rescheduleAppointmentFn, {
  speakDuring: true,
  speakDuringMessage: 'Let me reschedule that for you.',
  responseVariables: {
    resched_success: 'result.success',
    resched_message: 'result.message',
  },
});
export const retellCancelAppointmentTool = toRetellTool(cancelAppointmentFn, {
  speakDuring: true,
  speakDuringMessage: 'Let me take care of that.',
  responseVariables: {
    cancel_success: 'result.success',
    cancel_message: 'result.message',
  },
});
export const retellSaveInsuranceTool = toRetellTool(saveInsuranceFn, {
  speakDuring: true,
  speakDuringMessage: 'Saving that now.',
});
export const retellProcessPaymentTool = toRetellTool(processPaymentFn, {
  speakDuring: true,
  speakDuringMessage: 'Processing that now.',
  timeoutMs: 45_000,
});
export const retellCreatePaymentPlanTool = toRetellTool(createPaymentPlanFn);
export const retellTakeMessageTool = toRetellTool(takeMessageFn, {
  speakDuring: true,
  speakDuringMessage: 'Of course, let me note that down.',
});
export const retellGetProvidersTool = toRetellTool(getProvidersFn);

// ---------------------------------------------------------------------------
// Tool Groups (mirror Vapi tool groups)
// ---------------------------------------------------------------------------

export const RETELL_BOOKING_TOOLS: RetellCustomTool[] = [
  retellLookupPatientTool,
  retellCreatePatientTool,
  retellCheckAvailabilityTool,
  retellBookAppointmentTool,
];

export const RETELL_APPOINTMENT_MGMT_TOOLS: RetellCustomTool[] = [
  retellLookupPatientTool,
  retellGetAppointmentsTool,
  retellRescheduleAppointmentTool,
  retellCancelAppointmentTool,
];

const getCallerContextFn: VapiToolFunction = {
  name: 'getCallerContext',
  description: 'Fetch pre-loaded context about the current caller: their name (if known), next upcoming booking, last visit, and a summary of their previous call. Call this immediately at the start of the conversation to personalize the greeting. No parameters needed.',
  parameters: {
    type: 'object',
    properties: {},
  },
};

export const retellGetCallerContextTool = toRetellTool(getCallerContextFn, {
  speakDuring: false,
  speakDuringMessage: '',
  timeoutMs: 5_000,
  responseVariables: {
    caller_patient_type: 'result.patientType',
    caller_patient_name: 'result.patientName',
    caller_patient_id: 'result.patientId',
    caller_next_booking: 'result.nextBooking',
  },
});

export const RETELL_RECEPTIONIST_TOOLS: RetellCustomTool[] = [
  retellGetProvidersTool,
  retellGetCallerContextTool,
];

export const RETELL_PATIENT_RECORDS_TOOLS: RetellCustomTool[] = [
  retellLookupPatientTool,
  retellCreatePatientTool,
  retellUpdatePatientTool,
  retellAddNoteTool,
];

export const RETELL_INSURANCE_BILLING_TOOLS: RetellCustomTool[] = [
  retellLookupPatientTool,
  retellGetInsuranceTool,
  retellVerifyInsuranceCoverageTool,
  retellGetBalanceTool,
  retellProcessPaymentTool,
];

export const RETELL_EMERGENCY_TOOLS: RetellCustomTool[] = [
  retellLookupPatientTool,
  retellCreatePatientTool,
  retellCheckAvailabilityTool,
  retellBookAppointmentTool,
];
