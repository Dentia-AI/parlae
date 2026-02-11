/**
 * Vapi PMS Tools Configuration
 * 
 * This file defines all the tools that Vapi AI assistants can use to interact
 * with Practice Management Systems (PMS) like Sikka.
 * 
 * These tools enable the AI to:
 * - Check appointment availability
 * - Book, reschedule, and cancel appointments
 * - Search for and manage patients
 * - Add notes to patient records
 * - Handle insurance information
 * - Process payments
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.com';
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET!;

/**
 * PMS Tools for Vapi Assistants
 * 
 * Usage:
 * Import these tools when creating/updating Vapi assistants or squads
 * 
 * Example:
 * ```typescript
 * import { PMS_TOOLS } from './vapi-pms-tools.config';
 * 
 * const assistant = await vapiClient.assistants.create({
 *   name: 'Dental Receptionist',
 *   tools: PMS_TOOLS,
 *   // ... other config
 * });
 * ```
 */
export const PMS_TOOLS = [
  // ============================================================================
  // Appointment Management
  // ============================================================================
  
  {
    type: 'function' as const,
    function: {
      name: 'checkAvailability',
      description: 'Check available appointment time slots for booking. Use this before booking to show patients what times are available.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            format: 'date',
            description: 'Date to check availability (YYYY-MM-DD format). Example: 2026-02-15',
          },
          appointmentType: {
            type: 'string',
            description: 'Type of appointment: cleaning, exam, filling, root-canal, extraction, etc.',
          },
          providerId: {
            type: 'string',
            description: 'Specific provider/dentist ID if patient has a preference (optional)',
          },
        },
        required: ['date'],
      },
      server: {
        url: `${BASE_URL}/api/pms/appointments/availability`,
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  
  {
    type: 'function' as const,
    function: {
      name: 'bookAppointment',
      description: 'Book a new appointment for a patient. Always check availability first before booking.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID from the PMS system. Use searchPatients first if you don\'t have this.',
          },
          appointmentType: {
            type: 'string',
            description: 'Type of appointment: cleaning, exam, filling, root-canal, extraction, etc.',
          },
          startTime: {
            type: 'string',
            format: 'date-time',
            description: 'Start time in ISO 8601 format. Example: 2026-02-15T10:00:00Z',
          },
          duration: {
            type: 'number',
            description: 'Duration in minutes. Default is 30 minutes.',
          },
          notes: {
            type: 'string',
            description: 'Any special notes or instructions for the appointment (optional)',
          },
        },
        required: ['patientId', 'appointmentType', 'startTime', 'duration'],
      },
      server: {
        url: `${BASE_URL}/api/pms/appointments`,
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  
  {
    type: 'function' as const,
    function: {
      name: 'rescheduleAppointment',
      description: 'Reschedule an existing appointment to a new date/time. Check availability before rescheduling.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: {
            type: 'string',
            description: 'ID of the appointment to reschedule',
          },
          startTime: {
            type: 'string',
            format: 'date-time',
            description: 'New start time in ISO 8601 format. Example: 2026-02-20T14:00:00Z',
          },
          sendNotification: {
            type: 'boolean',
            description: 'Whether to send notification to patient about the change. Default: true',
          },
        },
        required: ['appointmentId', 'startTime'],
      },
      server: {
        url: `${BASE_URL}/api/pms/appointments`,
        method: 'PATCH',
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  
  {
    type: 'function' as const,
    function: {
      name: 'cancelAppointment',
      description: 'Cancel an existing appointment. Always confirm with the patient before canceling.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: {
            type: 'string',
            description: 'ID of the appointment to cancel',
          },
          reason: {
            type: 'string',
            description: 'Reason for cancellation (optional)',
          },
          sendNotification: {
            type: 'boolean',
            description: 'Whether to send cancellation notification to patient. Default: true',
          },
        },
        required: ['appointmentId'],
      },
      server: {
        url: `${BASE_URL}/api/pms/appointments`,
        method: 'DELETE',
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  
  // ============================================================================
  // Patient Management
  // ============================================================================
  
  {
    type: 'function' as const,
    function: {
      name: 'searchPatients',
      description: 'Search for patients by name, phone number, or email. Use this to find a patient\'s ID before booking appointments.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term: patient name, phone number, or email',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return. Default: 10',
          },
        },
        required: ['query'],
      },
      server: {
        url: `${BASE_URL}/api/pms/patients/search`,
        timeoutSeconds: 15,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  
  {
    type: 'function' as const,
    function: {
      name: 'getPatientInfo',
      description: 'Get detailed information about a patient including contact info, balance, and last visit.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID from the PMS system',
          },
        },
        required: ['patientId'],
      },
      server: {
        url: `${BASE_URL}/api/pms/patients`,
        timeoutSeconds: 15,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  
  {
    type: 'function' as const,
    function: {
      name: 'createPatient',
      description: 'Create a new patient record in the PMS. Use this for first-time patients.',
      parameters: {
        type: 'object',
        properties: {
          firstName: {
            type: 'string',
            description: 'Patient\'s first name',
          },
          lastName: {
            type: 'string',
            description: 'Patient\'s last name',
          },
          phone: {
            type: 'string',
            description: 'Patient\'s phone number',
          },
          email: {
            type: 'string',
            description: 'Patient\'s email address (optional)',
          },
          dateOfBirth: {
            type: 'string',
            format: 'date',
            description: 'Date of birth in YYYY-MM-DD format (optional)',
          },
        },
        required: ['firstName', 'lastName', 'phone'],
      },
      server: {
        url: `${BASE_URL}/api/pms/patients`,
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  
  {
    type: 'function' as const,
    function: {
      name: 'addPatientNote',
      description: 'Add a note to a patient\'s record. Use this to document important information from calls.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID',
          },
          content: {
            type: 'string',
            description: 'Note content - what the patient said or any important information',
          },
          category: {
            type: 'string',
            description: 'Note category: preference, allergy, medical-history, general (optional)',
          },
        },
        required: ['patientId', 'content'],
      },
      server: {
        url: `${BASE_URL}/api/pms/patients/notes`,
        timeoutSeconds: 15,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  
  // ============================================================================
  // Insurance & Billing
  // ============================================================================
  
  {
    type: 'function' as const,
    function: {
      name: 'getPatientBalance',
      description: 'Check a patient\'s account balance and payment history.',
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
      server: {
        url: `${BASE_URL}/api/pms/patients/balance`,
        timeoutSeconds: 15,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  
  {
    type: 'function' as const,
    function: {
      name: 'getPatientInsurance',
      description: 'Get patient\'s insurance information.',
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
      server: {
        url: `${BASE_URL}/api/pms/patients/insurance`,
        timeoutSeconds: 15,
        secret: WEBHOOK_SECRET,
      },
    },
  },
  
  {
    type: 'function' as const,
    function: {
      name: 'processPayment',
      description: 'Process a payment for a patient. Use with caution and always confirm amount with patient.',
      parameters: {
        type: 'object',
        properties: {
          patientId: {
            type: 'string',
            description: 'Patient ID',
          },
          amount: {
            type: 'number',
            description: 'Payment amount in dollars',
          },
          method: {
            type: 'string',
            enum: ['cash', 'check', 'credit_card', 'debit_card', 'ach'],
            description: 'Payment method',
          },
          notes: {
            type: 'string',
            description: 'Payment notes (optional)',
          },
        },
        required: ['patientId', 'amount', 'method'],
      },
      server: {
        url: `${BASE_URL}/api/pms/payments`,
        timeoutSeconds: 20,
        secret: WEBHOOK_SECRET,
      },
    },
  },
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
 */
export const PMS_SYSTEM_PROMPT_ADDITION = `

You have access to the practice management system and can:
1. Check appointment availability
2. Book, reschedule, and cancel appointments
3. Search for and manage patient records
4. Add notes to patient files
5. Check insurance and billing information
6. Process payments

IMPORTANT GUIDELINES:
- Always search for a patient first before booking appointments
- Always check availability before booking or rescheduling
- Always confirm details with the patient before making changes
- Be careful with PHI (Protected Health Information) - never share sensitive data inappropriately
- If you need to transfer to a human, explain why and what you've done so far
- For emergencies, prioritize urgent care and escalate appropriately

APPOINTMENT BOOKING FLOW:
1. Greet the patient and ask what they need
2. If booking: Ask for their name and phone to search for their record
3. If new patient: Collect basic info (first name, last name, phone, email)
4. Ask for preferred appointment type (cleaning, exam, etc.)
5. Check availability and offer time slots
6. Confirm the appointment details
7. Book the appointment
8. Provide confirmation number and details

Be warm, professional, and helpful. You're the friendly voice of the practice!
`;
