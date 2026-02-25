/**
 * Retell AI Dental Clinic Template
 *
 * Defines 6 Retell agents mirroring the Vapi squad:
 *   1. Receptionist — entry point, routes to specialists via agent_swap
 *   2. Booking Agent — new appointment booking
 *   3. Appointment Management — cancel/reschedule/lookup
 *   4. Patient Records — HIPAA-sensitive data updates
 *   5. Insurance & Billing — coverage + payments
 *   6. Emergency — urgent/critical path
 *
 * Reuses the same system prompts from the Vapi template.
 * Agent_swap tools replace Vapi's handoff destinations.
 */

import {
  RECEPTIONIST_SYSTEM_PROMPT,
  BOOKING_AGENT_SYSTEM_PROMPT,
  APPOINTMENT_MGMT_SYSTEM_PROMPT,
  PATIENT_RECORDS_SYSTEM_PROMPT,
  INSURANCE_BILLING_SYSTEM_PROMPT,
  EMERGENCY_SYSTEM_PROMPT,
} from '../../vapi/templates/dental-clinic.template';

import type { RetellCustomTool, RetellAgentSwapTool, RetellEndCallTool, RetellTransferCallTool } from '../retell.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RETELL_DENTAL_CLINIC_VERSION = 'v1.0';

export type RetellAgentRole =
  | 'receptionist'
  | 'booking'
  | 'appointmentMgmt'
  | 'patientRecords'
  | 'insuranceBilling'
  | 'emergency';

export const RETELL_AGENT_ROLES: RetellAgentRole[] = [
  'receptionist',
  'booking',
  'appointmentMgmt',
  'patientRecords',
  'insuranceBilling',
  'emergency',
];

// ---------------------------------------------------------------------------
// Agent Config Interface
// ---------------------------------------------------------------------------

export interface RetellAgentDefinition {
  role: RetellAgentRole;
  name: string;
  systemPrompt: string;
  beginMessage: string;
  startSpeaker: 'agent' | 'user';
  toolGroup: string;
  /** Roles this agent can swap to */
  swapTargets: Array<{
    role: RetellAgentRole;
    toolName: string;
    description: string;
  }>;
  /** If set, add a transfer_call tool to this number */
  transferToClinic?: boolean;
}

// ---------------------------------------------------------------------------
// Agent Definitions (mirrors getDentalClinicTemplate() from Vapi)
// ---------------------------------------------------------------------------

export const RETELL_AGENT_DEFINITIONS: RetellAgentDefinition[] = [
  {
    role: 'receptionist',
    name: 'Receptionist',
    systemPrompt: RECEPTIONIST_SYSTEM_PROMPT,
    beginMessage: 'Thank you for calling {{clinicName}}! How can I help you today?',
    startSpeaker: 'agent',
    toolGroup: 'receptionist',
    swapTargets: [
      {
        role: 'emergency',
        toolName: 'route_to_emergency',
        description: 'Caller describes pain, bleeding, trauma, swelling, breathing difficulty, or any urgent/emergency symptoms.',
      },
      {
        role: 'booking',
        toolName: 'route_to_booking',
        description: 'Caller wants to book a new appointment, schedule a visit, or find available times.',
      },
      {
        role: 'appointmentMgmt',
        toolName: 'route_to_appointment_mgmt',
        description: 'Caller wants to cancel, reschedule, check on, or change an existing appointment.',
      },
      {
        role: 'patientRecords',
        toolName: 'route_to_patient_records',
        description: 'Caller wants to update personal info (address, phone, email, medical history).',
      },
      {
        role: 'insuranceBilling',
        toolName: 'route_to_insurance_billing',
        description: 'Caller has questions about insurance coverage, billing, balance, or payments.',
      },
    ],
  },
  {
    role: 'booking',
    name: 'Booking Agent',
    systemPrompt: BOOKING_AGENT_SYSTEM_PROMPT,
    beginMessage: 'Sure, I can help with that. What day works best for you?',
    startSpeaker: 'agent',
    toolGroup: 'booking',
    swapTargets: [
      {
        role: 'emergency',
        toolName: 'route_to_emergency',
        description: 'Caller describes urgent symptoms during booking.',
      },
      {
        role: 'appointmentMgmt',
        toolName: 'route_to_appointment_mgmt',
        description: 'Caller wants to cancel or reschedule an existing appointment, not book new.',
      },
      {
        role: 'receptionist',
        toolName: 'route_to_receptionist',
        description: 'Caller needs general help or you cannot resolve their issue.',
      },
    ],
  },
  {
    role: 'appointmentMgmt',
    name: 'Appointment Management',
    systemPrompt: APPOINTMENT_MGMT_SYSTEM_PROMPT,
    beginMessage: 'Sure, let me pull up your appointment. Can I get your name or phone number?',
    startSpeaker: 'agent',
    toolGroup: 'appointmentMgmt',
    swapTargets: [
      {
        role: 'emergency',
        toolName: 'route_to_emergency',
        description: 'Caller describes urgent symptoms.',
      },
      {
        role: 'booking',
        toolName: 'route_to_booking',
        description: 'Caller wants to book a brand new appointment, not reschedule.',
      },
      {
        role: 'receptionist',
        toolName: 'route_to_receptionist',
        description: 'Caller needs general help.',
      },
    ],
  },
  {
    role: 'patientRecords',
    name: 'Patient Records',
    systemPrompt: PATIENT_RECORDS_SYSTEM_PROMPT,
    beginMessage: 'Of course, I can help with that. Can I get your name or phone number to pull up your file?',
    startSpeaker: 'agent',
    toolGroup: 'patientRecords',
    swapTargets: [
      {
        role: 'emergency',
        toolName: 'route_to_emergency',
        description: 'Caller describes urgent symptoms.',
      },
      {
        role: 'booking',
        toolName: 'route_to_booking',
        description: 'Caller wants to book an appointment.',
      },
      {
        role: 'insuranceBilling',
        toolName: 'route_to_insurance_billing',
        description: 'Caller wants to update insurance or check billing.',
      },
      {
        role: 'receptionist',
        toolName: 'route_to_receptionist',
        description: 'Caller needs general help.',
      },
    ],
  },
  {
    role: 'insuranceBilling',
    name: 'Insurance & Billing',
    systemPrompt: INSURANCE_BILLING_SYSTEM_PROMPT,
    beginMessage: 'Sure, I can help with that. Can I get your name to look up your account?',
    startSpeaker: 'agent',
    toolGroup: 'insuranceBilling',
    swapTargets: [
      {
        role: 'emergency',
        toolName: 'route_to_emergency',
        description: 'Caller describes urgent symptoms.',
      },
      {
        role: 'booking',
        toolName: 'route_to_booking',
        description: 'Caller wants to book an appointment.',
      },
      {
        role: 'patientRecords',
        toolName: 'route_to_patient_records',
        description: 'Caller wants to update non-insurance personal info.',
      },
      {
        role: 'receptionist',
        toolName: 'route_to_receptionist',
        description: 'Caller needs general help.',
      },
    ],
  },
  {
    role: 'emergency',
    name: 'Emergency',
    systemPrompt: EMERGENCY_SYSTEM_PROMPT,
    beginMessage: 'I understand this is urgent. Can you tell me what is happening right now?',
    startSpeaker: 'agent',
    toolGroup: 'emergency',
    transferToClinic: true,
    swapTargets: [
      {
        role: 'booking',
        toolName: 'route_to_booking',
        description: 'After emergency is assessed, patient needs a follow-up appointment.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Tool Group Mapping (maps toolGroup string to Retell tool list import key)
// ---------------------------------------------------------------------------

export const RETELL_TOOL_GROUP_MAP: Record<string, string> = {
  receptionist: 'RETELL_RECEPTIONIST_TOOLS',
  booking: 'RETELL_BOOKING_TOOLS',
  appointmentMgmt: 'RETELL_APPOINTMENT_MGMT_TOOLS',
  patientRecords: 'RETELL_PATIENT_RECORDS_TOOLS',
  insuranceBilling: 'RETELL_INSURANCE_BILLING_TOOLS',
  emergency: 'RETELL_EMERGENCY_TOOLS',
};

// ---------------------------------------------------------------------------
// Shared agent configuration values
// ---------------------------------------------------------------------------

export const SHARED_RETELL_AGENT_CONFIG = {
  language: 'multi' as const,
  vocab_specialization: 'medical' as const,
  responsiveness: 0.9,
  interruption_sensitivity: 0.7,
  enable_backchannel: true,
  backchannel_frequency: 0.6,
  reminder_trigger_ms: 10_000,
  reminder_max_count: 2,
  normalize_for_speech: true,
  end_call_after_silence_ms: 600_000,
  max_call_duration_ms: 3_600_000,
};

// ---------------------------------------------------------------------------
// Post-call analysis schema (mirrors Vapi CALL_ANALYSIS_SCHEMA)
// ---------------------------------------------------------------------------

export const RETELL_POST_CALL_ANALYSIS: Array<{
  name: string;
  type: 'string' | 'enum' | 'boolean' | 'number';
  description: string;
  choices?: string[];
}> = [
  {
    name: 'call_outcome',
    type: 'enum',
    description: 'What was the final outcome of the call?',
    choices: [
      'appointment_booked',
      'appointment_cancelled',
      'appointment_rescheduled',
      'patient_created',
      'insurance_updated',
      'payment_processed',
      'general_inquiry',
      'transferred_to_human',
      'caller_hung_up',
      'emergency_handled',
      'no_resolution',
    ],
  },
  {
    name: 'patient_name',
    type: 'string',
    description: 'Full name of the patient (if identified)',
  },
  {
    name: 'appointment_type',
    type: 'string',
    description: 'Type of appointment discussed (e.g. cleaning, exam, emergency)',
  },
  {
    name: 'caller_satisfied',
    type: 'boolean',
    description: 'Whether the caller seemed satisfied with the interaction',
  },
  {
    name: 'tools_used_count',
    type: 'number',
    description: 'Number of backend tools that were called during the conversation',
  },
];
