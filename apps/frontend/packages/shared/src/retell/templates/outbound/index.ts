export {
  buildPatientCareOutboundFlow,
  OUTBOUND_PATIENT_CARE_FLOW_VERSION,
} from './patient-care.flow-template';
export type { OutboundFlowBuildConfig } from './patient-care.flow-template';

export {
  buildFinancialOutboundFlow,
  OUTBOUND_FINANCIAL_FLOW_VERSION,
} from './financial.flow-template';

export * from './patient-care-prompts';
export * from './financial-prompts';
