/**
 * Vapi Chat API helpers for the deterministic test runner.
 */

import {
  VAPI_API_KEY,
  VAPI_BASE_URL,
  BACKEND_URL,
} from './sim-config';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;
const REQUEST_TIMEOUT_MS = 90_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function vapiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${VAPI_BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Vapi ${method} ${path}: timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : INITIAL_BACKOFF_MS * Math.pow(2, attempt);

      if (attempt < MAX_RETRIES) {
        process.stdout.write(
          `\n     Rate limited, waiting ${(waitMs / 1000).toFixed(0)}s (retry ${attempt + 1}/${MAX_RETRIES})... `,
        );
        await sleep(waitMs);
        continue;
      }
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Vapi ${method} ${path} (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  throw new Error(`Vapi ${method} ${path}: max retries (${MAX_RETRIES}) exceeded`);
}

// ---------------------------------------------------------------------------
// Backend test introspection
// ---------------------------------------------------------------------------

export interface ToolCallRecord {
  toolName: string;
  parameters: Record<string, unknown>;
  result: string;
  success: boolean;
  timestamp: string;
  durationMs: number;
}

export interface IntrospectionResult {
  callId: string;
  toolCalls: ToolCallRecord[];
}

export async function getToolCallHistory(
  callId: string,
): Promise<IntrospectionResult | null> {
  if (!BACKEND_URL) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/vapi/test/call/${callId}/tools`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) return null;
    return (await res.json()) as IntrospectionResult;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Chat API — deterministic text-based testing
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

export interface ChatResponse {
  id: string;
  sessionId?: string;
  output: ChatMessage[];
  messages: ChatMessage[];
  [k: string]: unknown;
}

/**
 * Start a new chat conversation with an assistant or squad.
 */
export async function startChat(
  assistantOrSquadId: string,
  message: string,
  mode: 'assistant' | 'squad' = 'assistant',
): Promise<ChatResponse> {
  const body: Record<string, unknown> = { input: message };
  if (mode === 'squad') {
    body.squadId = assistantOrSquadId;
  } else {
    body.assistantId = assistantOrSquadId;
  }
  return vapiRequest<ChatResponse>('POST', '/chat', body);
}

/**
 * Continue an existing chat conversation.
 * Uses previousChatId to chain messages in the same session.
 */
export async function continueChat(
  previousChatId: string,
  message: string,
  assistantOrSquadId?: string,
  mode: 'assistant' | 'squad' = 'assistant',
): Promise<ChatResponse> {
  const body: Record<string, unknown> = {
    previousChatId,
    input: message,
  };
  if (assistantOrSquadId) {
    if (mode === 'squad') {
      body.squadId = assistantOrSquadId;
    } else {
      body.assistantId = assistantOrSquadId;
    }
  }
  return vapiRequest<ChatResponse>('POST', '/chat', body);
}

/**
 * Fetch the full call object from Vapi.
 */
export async function getCall(callId: string): Promise<Record<string, unknown>> {
  return vapiRequest<Record<string, unknown>>('GET', `/call/${callId}`);
}
