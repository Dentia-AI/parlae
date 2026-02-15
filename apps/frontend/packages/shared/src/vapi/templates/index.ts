export {
  getDentalClinicTemplate,
  DENTAL_CLINIC_TEMPLATE_NAME,
  DENTAL_CLINIC_TEMPLATE_VERSION,
  DENTAL_CLINIC_TEMPLATE_DISPLAY_NAME,
} from './dental-clinic.template';
export type {
  DentalClinicTemplateConfig,
  SquadMemberTemplate,
} from './dental-clinic.template';

export {
  hydratePlaceholders,
  buildSquadPayloadFromTemplate,
  templateToDbShape,
  dbShapeToTemplate,
} from './template-utils';
export type {
  TemplateVariables,
  RuntimeConfig,
} from './template-utils';
