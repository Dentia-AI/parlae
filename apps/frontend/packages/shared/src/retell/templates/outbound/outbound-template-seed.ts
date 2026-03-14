/**
 * Seed Default Outbound Agent Templates
 *
 * Reads the built-in outbound prompts and flow structures, serializes to DB shape,
 * and upserts into the OutboundAgentTemplate table for both agent groups.
 *
 * Usage:
 *   - Called from admin seed endpoint (/api/admin/outbound-templates { fromBuiltIn: true })
 *   - Can be auto-called if no templates exist yet
 */

import {
  buildPatientCareOutboundFlow,
  OUTBOUND_PATIENT_CARE_FLOW_VERSION,
} from './patient-care.flow-template';

import {
  buildFinancialOutboundFlow,
  OUTBOUND_FINANCIAL_FLOW_VERSION,
} from './financial.flow-template';

import {
  OUTBOUND_GLOBAL_PROMPT,
  OUTBOUND_ROUTER_PROMPT,
  OUTBOUND_RECALL_PROMPT,
  OUTBOUND_REMINDER_PROMPT,
  OUTBOUND_FOLLOWUP_PROMPT,
  OUTBOUND_NOSHOW_PROMPT,
  OUTBOUND_TREATMENT_PLAN_PROMPT,
  OUTBOUND_POSTOP_PROMPT,
  OUTBOUND_REACTIVATION_PROMPT,
  OUTBOUND_SURVEY_PROMPT,
  OUTBOUND_WELCOME_PROMPT,
  OUTBOUND_BOOKING_COLLECT_PROMPT,
  OUTBOUND_BOOKING_PICK_SLOT_PROMPT,
  OUTBOUND_BOOKING_DONE_PROMPT,
  OUTBOUND_BOOKING_FAILED_PROMPT,
} from './patient-care-prompts';

import {
  FINANCIAL_GLOBAL_PROMPT,
  FINANCIAL_ROUTER_PROMPT,
  FINANCIAL_PAYMENT_PROMPT,
  FINANCIAL_BENEFITS_PROMPT,
  FINANCIAL_BOOKING_COLLECT_PROMPT,
  FINANCIAL_BOOKING_PICK_SLOT_PROMPT,
  FINANCIAL_BOOKING_DONE_PROMPT,
  FINANCIAL_BOOKING_FAILED_PROMPT,
} from './financial-prompts';

const PLACEHOLDER_CONFIG = {
  clinicName: '{{clinicName}}',
  clinicPhone: '{{clinicPhone}}',
  webhookUrl: '{{webhookUrl}}',
  webhookSecret: '{{secret}}',
  accountId: '{{accountId}}',
};

function buildPatientCareDbShape() {
  const flowConfig = buildPatientCareOutboundFlow(PLACEHOLDER_CONFIG);

  const promptTemplates: Record<string, string> = {
    global: OUTBOUND_GLOBAL_PROMPT,
    router: OUTBOUND_ROUTER_PROMPT,
    recall: OUTBOUND_RECALL_PROMPT,
    reminder: OUTBOUND_REMINDER_PROMPT,
    followup: OUTBOUND_FOLLOWUP_PROMPT,
    noshow: OUTBOUND_NOSHOW_PROMPT,
    treatment_plan: OUTBOUND_TREATMENT_PLAN_PROMPT,
    postop: OUTBOUND_POSTOP_PROMPT,
    reactivation: OUTBOUND_REACTIVATION_PROMPT,
    survey: OUTBOUND_SURVEY_PROMPT,
    welcome: OUTBOUND_WELCOME_PROMPT,
    booking_collect: OUTBOUND_BOOKING_COLLECT_PROMPT,
    booking_pick_slot: OUTBOUND_BOOKING_PICK_SLOT_PROMPT,
    booking_done: OUTBOUND_BOOKING_DONE_PROMPT,
    booking_failed: OUTBOUND_BOOKING_FAILED_PROMPT,
  };

  const voicemailMessages: Record<string, string> = {
    recall:
      'Hi {{patient_name}}, this is {{clinic_name}} calling. It looks like it\'s time for your regular dental check-up and cleaning. Please call us back at {{clinic_phone}} to schedule your appointment. We look forward to seeing you!',
    reminder:
      'Hi {{patient_name}}, this is {{clinic_name}} calling to remind you of your upcoming appointment on {{appointment_date}} at {{appointment_time}}. If you need to reschedule, please call us at {{clinic_phone}}. See you soon!',
    followup:
      'Hi {{patient_name}}, this is {{clinic_name}} checking in after your recent {{procedure_name}}. We hope you\'re recovering well. If you have any concerns, please call us at {{clinic_phone}}.',
    noshow:
      'Hi {{patient_name}}, this is {{clinic_name}}. We missed you at your appointment on {{appointment_date}}. We hope everything is okay! Please call us at {{clinic_phone}} to reschedule at your convenience.',
    treatment_plan:
      'Hi {{patient_name}}, this is {{clinic_name}} following up on the treatment plan discussed during your last visit. Please call us at {{clinic_phone}} when you\'re ready to schedule.',
    postop:
      'Hi {{patient_name}}, this is {{clinic_name}} calling to check on your recovery after your recent {{procedure_name}}. If you have any concerns, please call us at {{clinic_phone}} right away.',
    reactivation:
      'Hi {{patient_name}}, this is {{clinic_name}}. It\'s been a while since your last visit and we\'d love to see you again! Please call us at {{clinic_phone}} to schedule a check-up.',
    survey:
      'Hi {{patient_name}}, this is {{clinic_name}}. We\'d love to hear about your recent experience with us. Please call us back at {{clinic_phone}} or visit our website to share your feedback.',
    welcome:
      'Hi {{patient_name}}, welcome to {{clinic_name}}! We\'re excited to have you as a new patient. Please call us at {{clinic_phone}} if you have any questions before your first visit.',
  };

  return {
    agentGroup: 'PATIENT_CARE' as const,
    name: 'Patient Care Outbound Agent',
    flowConfig,
    promptTemplates,
    voicemailMessages,
    version: OUTBOUND_PATIENT_CARE_FLOW_VERSION,
  };
}

function buildFinancialDbShape() {
  const flowConfig = buildFinancialOutboundFlow(PLACEHOLDER_CONFIG);

  const promptTemplates: Record<string, string> = {
    global: FINANCIAL_GLOBAL_PROMPT,
    router: FINANCIAL_ROUTER_PROMPT,
    payment: FINANCIAL_PAYMENT_PROMPT,
    benefits: FINANCIAL_BENEFITS_PROMPT,
    booking_collect: FINANCIAL_BOOKING_COLLECT_PROMPT,
    booking_pick_slot: FINANCIAL_BOOKING_PICK_SLOT_PROMPT,
    booking_done: FINANCIAL_BOOKING_DONE_PROMPT,
    booking_failed: FINANCIAL_BOOKING_FAILED_PROMPT,
  };

  const voicemailMessages: Record<string, string> = {
    payment:
      'Hi {{patient_name}}, this is {{clinic_name}} calling about your account. We have some information to share with you. Please call us back at {{clinic_phone}} at your convenience.',
    benefits:
      'Hi {{patient_name}}, this is {{clinic_name}} calling with important information about your dental insurance benefits. Your benefits may be expiring soon. Please call us at {{clinic_phone}} so we can help you make the most of your coverage.',
  };

  return {
    agentGroup: 'FINANCIAL' as const,
    name: 'Financial Outbound Agent',
    flowConfig,
    promptTemplates,
    voicemailMessages,
    version: OUTBOUND_FINANCIAL_FLOW_VERSION,
  };
}

/**
 * Upsert both outbound agent templates from built-in prompts.
 * Returns the IDs of the created/updated templates.
 */
export async function seedOutboundTemplates(
  prisma: any,
): Promise<{ patientCareId: string; financialId: string }> {
  const pcShape = buildPatientCareDbShape();
  const finShape = buildFinancialDbShape();

  const patientCare = await prisma.outboundAgentTemplate.upsert({
    where: { agentGroup: 'PATIENT_CARE' },
    update: {
      name: pcShape.name,
      flowConfig: pcShape.flowConfig,
      promptTemplates: pcShape.promptTemplates,
      voicemailMessages: pcShape.voicemailMessages,
      version: pcShape.version,
    },
    create: {
      agentGroup: pcShape.agentGroup,
      name: pcShape.name,
      flowConfig: pcShape.flowConfig,
      promptTemplates: pcShape.promptTemplates,
      voicemailMessages: pcShape.voicemailMessages,
      version: pcShape.version,
    },
  });

  const financial = await prisma.outboundAgentTemplate.upsert({
    where: { agentGroup: 'FINANCIAL' },
    update: {
      name: finShape.name,
      flowConfig: finShape.flowConfig,
      promptTemplates: finShape.promptTemplates,
      voicemailMessages: finShape.voicemailMessages,
      version: finShape.version,
    },
    create: {
      agentGroup: finShape.agentGroup,
      name: finShape.name,
      flowConfig: finShape.flowConfig,
      promptTemplates: finShape.promptTemplates,
      voicemailMessages: finShape.voicemailMessages,
      version: finShape.version,
    },
  });

  return {
    patientCareId: patientCare.id,
    financialId: financial.id,
  };
}

/**
 * Ensure outbound templates exist. If not, seed from built-in.
 * If existing versions are older, re-seed to upgrade.
 */
export async function ensureOutboundTemplates(
  prisma: any,
): Promise<{ patientCareId: string; financialId: string }> {
  const existing = await prisma.outboundAgentTemplate.findMany({
    where: { isActive: true },
    select: { id: true, agentGroup: true, version: true },
  });

  const pcTemplate = existing.find((t: any) => t.agentGroup === 'PATIENT_CARE');
  const finTemplate = existing.find((t: any) => t.agentGroup === 'FINANCIAL');

  const pcNeedsUpdate =
    !pcTemplate || pcTemplate.version < OUTBOUND_PATIENT_CARE_FLOW_VERSION;
  const finNeedsUpdate =
    !finTemplate || finTemplate.version < OUTBOUND_FINANCIAL_FLOW_VERSION;

  if (pcNeedsUpdate || finNeedsUpdate) {
    return seedOutboundTemplates(prisma);
  }

  return {
    patientCareId: pcTemplate.id,
    financialId: finTemplate.id,
  };
}
