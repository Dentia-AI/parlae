import 'server-only';

import { getLogger } from '@kit/shared/logger';
import { createRetellService, type RetellKnowledgeBaseResponse } from './retell.service';
import { createVapiService } from '../vapi/server';

const loggerPromise = getLogger();
const logger = {
  info: (...args: any[]) => loggerPromise.then((l) => l.info(...args)).catch(() => {}),
  warn: (...args: any[]) => loggerPromise.then((l) => l.warn(...args)).catch(() => {}),
  error: (...args: any[]) => loggerPromise.then((l) => l.error(...args)).catch(() => {}),
};

/**
 * Sync a clinic's Vapi knowledge base to Retell.
 *
 * Reads Vapi file metadata, downloads the files, and re-uploads them to Retell
 * as a single knowledge base. Returns the Retell knowledge_base_id.
 *
 * @param accountId - The clinic account ID (for namespacing)
 * @param vapiFileIds - Array of Vapi file IDs to sync
 * @param clinicName - Clinic display name
 * @param existingRetellKbId - If set, deletes old KB before creating new one
 */
export async function syncVapiKBToRetell(
  accountId: string,
  vapiFileIds: string[],
  clinicName: string,
  existingRetellKbId?: string,
): Promise<string | null> {
  const retell = createRetellService();
  const vapi = createVapiService();

  if (!retell.isEnabled()) {
    logger.warn('[RetellKB] Retell not enabled, skipping KB sync');
    return null;
  }

  if (!vapiFileIds || vapiFileIds.length === 0) {
    logger.info('[RetellKB] No Vapi file IDs to sync');
    return null;
  }

  const prefix = accountId.slice(0, 8);
  const kbName = `kb-${prefix}`;

  logger.info(
    { accountId: prefix, fileCount: vapiFileIds.length, clinicName },
    '[RetellKB] Starting Vapi -> Retell KB sync',
  );

  // Delete old Retell KB if provided
  if (existingRetellKbId) {
    try {
      await retell.deleteKnowledgeBase(existingRetellKbId);
      logger.info({ kbId: existingRetellKbId }, '[RetellKB] Deleted old knowledge base');
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : err },
        '[RetellKB] Non-fatal: could not delete old KB',
      );
    }
  }

  // Fetch Vapi file metadata and download content
  const fileBuffers: Array<{ name: string; buffer: Buffer; contentType: string }> = [];
  const textSnippets: Array<{ title: string; text: string }> = [];

  for (const fileId of vapiFileIds) {
    try {
      const fileInfo = await vapi.getFile(fileId);
      if (!fileInfo) {
        logger.warn({ fileId }, '[RetellKB] Could not fetch Vapi file metadata');
        continue;
      }

      const fileName = fileInfo.name || `file-${fileId}`;
      const fileUrl = fileInfo.url || fileInfo.path;

      if (fileUrl) {
        // Download the file
        const downloadRes = await fetch(fileUrl);
        if (downloadRes.ok) {
          const arrayBuffer = await downloadRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const contentType = downloadRes.headers.get('content-type') || 'application/octet-stream';

          fileBuffers.push({ name: fileName, buffer, contentType });
          logger.info(
            { fileId, fileName, size: buffer.length },
            '[RetellKB] Downloaded Vapi file',
          );
        } else {
          logger.warn(
            { fileId, fileName, status: downloadRes.status },
            '[RetellKB] Failed to download file, creating text snippet from name',
          );
          textSnippets.push({
            title: fileName,
            text: `Knowledge base document: ${fileName} (file ID: ${fileId})`,
          });
        }
      } else if (fileInfo.content) {
        textSnippets.push({
          title: fileName,
          text: fileInfo.content,
        });
        logger.info({ fileId, fileName }, '[RetellKB] Using inline text content');
      } else {
        logger.warn({ fileId, fileName }, '[RetellKB] No URL or content, skipping');
      }
    } catch (err) {
      logger.error(
        { fileId, error: err instanceof Error ? err.message : err },
        '[RetellKB] Error processing Vapi file',
      );
    }
  }

  if (fileBuffers.length === 0 && textSnippets.length === 0) {
    logger.warn('[RetellKB] No files or texts to upload to Retell');
    return null;
  }

  // Create Retell knowledge base
  const kb = await retell.createKnowledgeBase({
    name: kbName.slice(0, 39), // Retell limits to 40 chars
    files: fileBuffers.length > 0 ? fileBuffers : undefined,
    texts: textSnippets.length > 0 ? textSnippets : undefined,
  });

  if (!kb) {
    logger.error('[RetellKB] Failed to create Retell knowledge base');
    return null;
  }

  logger.info(
    { kbId: kb.knowledge_base_id, status: kb.status },
    '[RetellKB] Knowledge base created, waiting for processing',
  );

  // Poll until complete
  const finalKb = await retell.waitForKnowledgeBase(kb.knowledge_base_id);

  if (finalKb?.status === 'error') {
    logger.error(
      { kbId: kb.knowledge_base_id },
      '[RetellKB] Knowledge base processing failed',
    );
    return null;
  }

  logger.info(
    {
      kbId: kb.knowledge_base_id,
      status: finalKb?.status,
      sourceCount: finalKb?.knowledge_base_sources?.length,
    },
    '[RetellKB] Knowledge base ready',
  );

  return kb.knowledge_base_id;
}

/**
 * Ensure a Retell knowledge base exists for an account.
 *
 * Checks if the account already has a Retell KB (from metadata),
 * and creates/updates it if needed.
 */
export async function ensureRetellKnowledgeBase(
  accountId: string,
  vapiFileIds: string[],
  clinicName: string,
  existingRetellKbId?: string,
): Promise<string | null> {
  const retell = createRetellService();

  // If we already have a Retell KB, verify it still exists
  if (existingRetellKbId) {
    try {
      const kb = await retell.getKnowledgeBase(existingRetellKbId);
      if (kb && kb.status === 'complete') {
        logger.info(
          { kbId: existingRetellKbId },
          '[RetellKB] Existing knowledge base is still valid',
        );
        return existingRetellKbId;
      }
    } catch {
      logger.info('[RetellKB] Existing KB not found, creating new one');
    }
  }

  return syncVapiKBToRetell(accountId, vapiFileIds, clinicName, existingRetellKbId);
}
