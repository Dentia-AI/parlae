/**
 * Template Migration Utilities
 *
 * Detects breaking changes between two template versions and provides
 * migration warnings for the bulk-upgrade flow.
 */

import type { DentalClinicTemplateConfig } from './dental-clinic.template';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BreakingChangeType =
  | 'assistant_removed'
  | 'assistant_added'
  | 'assistant_renamed'
  | 'tool_group_changed'
  | 'model_changed'
  | 'voice_changed'
  | 'destination_changed';

export type MigrationWarning = {
  type: BreakingChangeType;
  severity: 'info' | 'warning' | 'breaking';
  assistant?: string;
  message: string;
};

export type MigrationReport = {
  fromVersion: string;
  toVersion: string;
  isBreaking: boolean;
  warnings: MigrationWarning[];
  summary: string;
};

// ---------------------------------------------------------------------------
// Comparison logic
// ---------------------------------------------------------------------------

/**
 * Compare two templates and return a migration report detailing
 * any breaking changes, warnings, or informational notes.
 */
export function compareTemplateVersions(
  oldTemplate: DentalClinicTemplateConfig,
  newTemplate: DentalClinicTemplateConfig,
): MigrationReport {
  const warnings: MigrationWarning[] = [];

  const oldMembers = oldTemplate.members;
  const newMembers = newTemplate.members;

  const oldNames = new Set(oldMembers.map((m) => m.assistant.name));
  const newNames = new Set(newMembers.map((m) => m.assistant.name));

  // Check for removed assistants (breaking)
  for (const name of oldNames) {
    if (!newNames.has(name)) {
      warnings.push({
        type: 'assistant_removed',
        severity: 'breaking',
        assistant: name,
        message: `Assistant "${name}" was removed. Existing handoff destinations referencing it will break.`,
      });
    }
  }

  // Check for added assistants (info)
  for (const name of newNames) {
    if (!oldNames.has(name)) {
      warnings.push({
        type: 'assistant_added',
        severity: 'info',
        assistant: name,
        message: `New assistant "${name}" added.`,
      });
    }
  }

  // Compare matching assistants
  for (const newMember of newMembers) {
    const oldMember = oldMembers.find(
      (m) => m.assistant.name === newMember.assistant.name,
    );

    if (!oldMember) continue;

    const oldA = oldMember.assistant;
    const newA = newMember.assistant;

    // Tool group changed (warning)
    if (oldA.toolGroup !== newA.toolGroup) {
      warnings.push({
        type: 'tool_group_changed',
        severity: 'warning',
        assistant: newA.name,
        message: `Tool group changed from "${oldA.toolGroup}" to "${newA.toolGroup}" for "${newA.name}".`,
      });
    }

    // Model changed (info/warning)
    if (
      oldA.model.provider !== newA.model.provider ||
      oldA.model.model !== newA.model.model
    ) {
      warnings.push({
        type: 'model_changed',
        severity: 'warning',
        assistant: newA.name,
        message: `Model changed from ${oldA.model.provider}/${oldA.model.model} to ${newA.model.provider}/${newA.model.model} for "${newA.name}".`,
      });
    }

    // Voice changed (info)
    if (oldA.voice.voiceId !== newA.voice.voiceId) {
      warnings.push({
        type: 'voice_changed',
        severity: 'info',
        assistant: newA.name,
        message: `Voice changed for "${newA.name}" (${oldA.voice.voiceId} → ${newA.voice.voiceId}).`,
      });
    }

    // Destinations changed (warning)
    const oldDests = new Set(
      oldMember.assistantDestinations.map((d) => d.assistantName),
    );
    const newDests = new Set(
      newMember.assistantDestinations.map((d) => d.assistantName),
    );

    const removedDests = [...oldDests].filter((d) => !newDests.has(d));
    const addedDests = [...newDests].filter((d) => !oldDests.has(d));

    if (removedDests.length > 0 || addedDests.length > 0) {
      const parts: string[] = [];
      if (removedDests.length > 0) {
        parts.push(`removed: ${removedDests.join(', ')}`);
      }
      if (addedDests.length > 0) {
        parts.push(`added: ${addedDests.join(', ')}`);
      }
      warnings.push({
        type: 'destination_changed',
        severity: removedDests.length > 0 ? 'warning' : 'info',
        assistant: newA.name,
        message: `Handoff destinations changed for "${newA.name}": ${parts.join('; ')}.`,
      });
    }
  }

  const isBreaking = warnings.some((w) => w.severity === 'breaking');

  // Build summary
  let summary: string;
  if (warnings.length === 0) {
    summary = 'No changes detected between versions.';
  } else if (isBreaking) {
    summary = `${warnings.filter((w) => w.severity === 'breaking').length} breaking change(s) detected. Review carefully before upgrading.`;
  } else {
    const warningCount = warnings.filter(
      (w) => w.severity === 'warning',
    ).length;
    const infoCount = warnings.filter((w) => w.severity === 'info').length;
    summary = `${warningCount} warning(s), ${infoCount} info note(s). No breaking changes.`;
  }

  return {
    fromVersion: oldTemplate.version,
    toVersion: newTemplate.version,
    isBreaking,
    warnings,
    summary,
  };
}

/**
 * Quick check: does the new template have strictly more assistants
 * than the old one, with no removals? (Safe additive upgrade)
 */
export function isAdditiveUpgrade(
  oldTemplate: DentalClinicTemplateConfig,
  newTemplate: DentalClinicTemplateConfig,
): boolean {
  const oldNames = new Set(oldTemplate.members.map((m) => m.assistant.name));
  const newNames = new Set(newTemplate.members.map((m) => m.assistant.name));

  // All old names must exist in new
  for (const name of oldNames) {
    if (!newNames.has(name)) return false;
  }

  return true;
}
