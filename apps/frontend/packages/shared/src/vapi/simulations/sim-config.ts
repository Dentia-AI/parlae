/**
 * Configuration for the deterministic chat test runner.
 * All secrets come from environment variables — never hardcode keys here.
 */

export const VAPI_API_KEY = process.env.VAPI_API_KEY ?? '';
export const VAPI_SQUAD_ID = process.env.VAPI_SQUAD_ID ?? '';
export const VAPI_BASE_URL = 'https://api.vapi.ai';

if (!VAPI_API_KEY) {
  throw new Error(
    'VAPI_API_KEY environment variable is required. Set it before running tests.',
  );
}
if (!VAPI_SQUAD_ID) {
  throw new Error(
    'VAPI_SQUAD_ID environment variable is required. Set it before running tests.',
  );
}

/**
 * Backend URL for test introspection endpoints.
 */
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL
  || process.env.BACKEND_API_URL
  || process.env.BACKEND_URL
  || '';

export const SIM_POLL_INTERVAL_MS = 5_000;
export const SIM_MAX_POLL_ATTEMPTS = 180;
