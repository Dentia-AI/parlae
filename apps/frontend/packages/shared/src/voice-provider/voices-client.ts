/**
 * Client-safe re-export of voice definitions.
 * Use this in 'use client' components instead of the main index
 * (which includes server-only resolve-provider.ts).
 */
export {
  VAPI_AVAILABLE_VOICES,
  RETELL_AVAILABLE_VOICES,
  getVoicesForProvider,
  type VoiceDefinition,
} from './voices';
