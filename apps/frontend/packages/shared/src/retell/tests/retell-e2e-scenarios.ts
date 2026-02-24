/**
 * Retell E2E Test Scenarios
 *
 * Scripted multi-turn scenarios for the E2E test runner.
 * Each scenario defines:
 *   - Which agent role to target
 *   - Expected tool calls the backend should receive
 *   - Assertions to run against the transcript and tool history
 */

import type { RetellAgentRole } from '../templates/dental-clinic.retell-template';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolAssertion {
  toolName: string;
  expectCalled: boolean;
  paramChecks?: Record<string, string | RegExp>;
  resultContains?: string;
}

export interface E2EScenario {
  name: string;
  category: 'booking' | 'emergency' | 'cancel' | 'reschedule' | 'info' | 'insurance';
  role: RetellAgentRole;
  description: string;
  dynamicVariables?: Record<string, string>;
  toolAssertions: ToolAssertion[];
  transcriptContains?: (string | RegExp)[];
  transcriptNotContains?: string[];
  maxDurationMs?: number;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const E2E_SCENARIOS: E2EScenario[] = [
  {
    name: 'Booking - Happy Path via Receptionist',
    category: 'booking',
    role: 'receptionist',
    description:
      'Caller asks to book a cleaning appointment. Agent should route to booking, check availability, collect info, create patient, and book.',
    toolAssertions: [
      { toolName: 'checkAvailability', expectCalled: true },
      { toolName: 'lookupPatient', expectCalled: true },
    ],
    transcriptContains: [/available|slot|time/i],
    maxDurationMs: 120_000,
  },
  {
    name: 'Booking - Direct to Booking Agent',
    category: 'booking',
    role: 'booking',
    description:
      'Call starts directly with booking agent. Caller wants a dental cleaning tomorrow.',
    dynamicVariables: {
      customer_phone: '+15550001234',
    },
    toolAssertions: [
      { toolName: 'checkAvailability', expectCalled: true, paramChecks: { date: '\\d{4}-\\d{2}-\\d{2}' } },
      { toolName: 'lookupPatient', expectCalled: true },
    ],
    transcriptContains: [/available|appointment|time/i],
    maxDurationMs: 90_000,
  },
  {
    name: 'Emergency - Tooth Knocked Out',
    category: 'emergency',
    role: 'emergency',
    description:
      'Caller reports a knocked-out tooth. Agent should recognize urgency and either transfer to human or provide emergency guidance.',
    toolAssertions: [
      { toolName: 'transferToHuman', expectCalled: true },
    ],
    transcriptContains: [/emergency|urgent|right away|immediately/i],
    maxDurationMs: 60_000,
  },
  {
    name: 'Cancel Appointment',
    category: 'cancel',
    role: 'appointmentMgmt',
    description:
      'Caller wants to cancel their upcoming appointment.',
    dynamicVariables: {
      customer_phone: '+15550001234',
    },
    toolAssertions: [
      { toolName: 'lookupPatient', expectCalled: true },
      { toolName: 'getAppointments', expectCalled: true },
      { toolName: 'cancelAppointment', expectCalled: true },
    ],
    transcriptContains: [/cancel/i],
    maxDurationMs: 90_000,
  },
  {
    name: 'Insurance Inquiry',
    category: 'insurance',
    role: 'insuranceBilling',
    description:
      'Caller asks about their insurance coverage and balance.',
    dynamicVariables: {
      customer_phone: '+15550001234',
    },
    toolAssertions: [
      { toolName: 'lookupPatient', expectCalled: true },
      { toolName: 'getPatientInsurance', expectCalled: true },
    ],
    transcriptContains: [/insurance|coverage/i],
    maxDurationMs: 90_000,
  },
];

export const E2E_SCENARIO_MAP: Record<string, E2EScenario[]> = {
  all: E2E_SCENARIOS,
  booking: E2E_SCENARIOS.filter((s) => s.category === 'booking'),
  emergency: E2E_SCENARIOS.filter((s) => s.category === 'emergency'),
  cancel: E2E_SCENARIOS.filter((s) => s.category === 'cancel'),
  insurance: E2E_SCENARIOS.filter((s) => s.category === 'insurance'),
};
