/**
 * Seed Default Conversation Flow Template
 *
 * Reads the built-in prompts and flow structure, serializes to DB shape,
 * and upserts into the RetellConversationFlowTemplate table.
 *
 * Usage:
 *   - Called from admin seed endpoint
 *   - Auto-called on first deploy if no default template exists
 */

import { flowTemplateToDbShape } from './flow-template-db';
import { CONVERSATION_FLOW_VERSION } from './dental-clinic.flow-template';

/**
 * Upsert the default conversation flow template into the database.
 * Returns the template ID.
 */
export async function seedDefaultFlowTemplate(
  prisma: any,
  createdBy?: string,
): Promise<string> {
  const dbShape = flowTemplateToDbShape();

  // Clear any existing defaults before setting the new one
  await prisma.retellConversationFlowTemplate.updateMany({
    where: { isDefault: true },
    data: { isDefault: false },
  });

  const template = await prisma.retellConversationFlowTemplate.upsert({
    where: { name: dbShape.name },
    update: {
      displayName: dbShape.displayName,
      description: dbShape.description,
      version: dbShape.version,
      isDefault: dbShape.isDefault,
      isActive: dbShape.isActive,
      globalPrompt: dbShape.globalPrompt,
      nodePrompts: dbShape.nodePrompts,
      nodeTools: dbShape.nodeTools,
      edgeConfig: dbShape.edgeConfig,
      modelConfig: dbShape.modelConfig,
      createdBy: createdBy ?? 'system',
    },
    create: {
      name: dbShape.name,
      displayName: dbShape.displayName,
      description: dbShape.description,
      version: dbShape.version,
      isDefault: dbShape.isDefault,
      isActive: dbShape.isActive,
      globalPrompt: dbShape.globalPrompt,
      nodePrompts: dbShape.nodePrompts,
      nodeTools: dbShape.nodeTools,
      edgeConfig: dbShape.edgeConfig,
      modelConfig: dbShape.modelConfig,
      createdBy: createdBy ?? 'system',
    },
  });

  return template.id;
}

/**
 * Ensure a default flow template exists. If not, seed one.
 * Returns the template ID.
 */
export async function ensureDefaultFlowTemplate(
  prisma: any,
): Promise<string> {
  const existing = await prisma.retellConversationFlowTemplate.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true, version: true },
  });

  if (existing) {
    // If the existing version is older than built-in, update it
    if (existing.version < CONVERSATION_FLOW_VERSION) {
      return seedDefaultFlowTemplate(prisma, 'system-auto-upgrade');
    }
    return existing.id;
  }

  return seedDefaultFlowTemplate(prisma);
}
