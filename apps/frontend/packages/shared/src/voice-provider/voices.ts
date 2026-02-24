/**
 * Voice definitions for both Vapi and Retell providers.
 *
 * Vapi uses Cartesia Sonic 3 voices (ultra-low latency, multilingual).
 * Retell uses ElevenLabs / platform voices.
 *
 * Both share the same VoiceDefinition shape so the UI can render them
 * identically regardless of provider.
 */

export interface VoiceDefinition {
  id: string;
  name: string;
  subtitle: string;
  provider: 'cartesia' | 'retell';
  voiceId: string;
  gender: 'male' | 'female';
  accent: string;
  description: string;
  previewUrl: string;
}

// ---------------------------------------------------------------------------
// Vapi voices (Cartesia Sonic 3)
// ---------------------------------------------------------------------------

export const VAPI_AVAILABLE_VOICES: VoiceDefinition[] = [
  {
    id: 'katie-cartesia',
    name: 'Katie',
    subtitle: 'Friendly Fixer',
    provider: 'cartesia',
    voiceId: 'f786b574-daa5-4673-aa0c-cbe3e8534c02',
    gender: 'female',
    accent: 'Multilingual',
    description: 'Enunciating and professional, ideal for a receptionist',
    previewUrl: '/audio/voices/katie-friendly-fixer.mp3',
  },
  {
    id: 'jacqueline-cartesia',
    name: 'Jacqueline',
    subtitle: 'Reassuring Agent',
    provider: 'cartesia',
    voiceId: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
    gender: 'female',
    accent: 'Multilingual',
    description: 'Confident and empathic, great for patient support',
    previewUrl: '/audio/voices/jacqueline-reassuring-agent.mp3',
  },
  {
    id: 'ariana-cartesia',
    name: 'Ariana',
    subtitle: 'Kind Friend',
    provider: 'cartesia',
    voiceId: 'ec1e269e-9ca0-402f-8a18-58e0e022355a',
    gender: 'female',
    accent: 'Multilingual',
    description: 'Friendly and approachable with a warm, welcoming tone',
    previewUrl: '/audio/voices/ariana-kind-friend.mp3',
  },
  {
    id: 'kira-cartesia',
    name: 'Kira',
    subtitle: 'Trusted Confidant',
    provider: 'cartesia',
    voiceId: '57dcab65-68ac-45a6-8480-6c4c52ec1cd1',
    gender: 'female',
    accent: 'Multilingual',
    description: 'Emotive and empathetic, builds trust with callers',
    previewUrl: '/audio/voices/kira-trusted-confidant.mp3',
  },
  {
    id: 'connie-cartesia',
    name: 'Connie',
    subtitle: 'Candid Conversationalist',
    provider: 'cartesia',
    voiceId: '8d8ce8c9-44a4-46c4-b10f-9a927b99a853',
    gender: 'female',
    accent: 'Multilingual',
    description: 'Natural and cheery, authentic conversational style',
    previewUrl: '/audio/voices/connie-candid-conversationalist.mp3',
  },
  {
    id: 'blake-cartesia',
    name: 'Blake',
    subtitle: 'Helpful Agent',
    provider: 'cartesia',
    voiceId: 'a167e0f3-df7e-4d52-a9c3-f949145efdab',
    gender: 'male',
    accent: 'Multilingual',
    description: 'Energetic and engaging, great for customer support',
    previewUrl: '/audio/voices/blake-helpful-agent.mp3',
  },
  {
    id: 'kiefer-cartesia',
    name: 'Kiefer',
    subtitle: 'Assured Tone',
    provider: 'cartesia',
    voiceId: '228fca29-3a0a-435c-8728-5cb483251068',
    gender: 'male',
    accent: 'Multilingual',
    description: 'Confident with strong clarity, composed and professional',
    previewUrl: '/audio/voices/kiefer-agent.mp3',
  },
  {
    id: 'kyle-cartesia',
    name: 'Kyle',
    subtitle: 'Approachable Friend',
    provider: 'cartesia',
    voiceId: 'c961b81c-a935-4c17-bfb3-ba2239de8c2f',
    gender: 'male',
    accent: 'Multilingual',
    description: 'Warm and conversational, instantly friendly',
    previewUrl: '/audio/voices/kyle-approachable-friend.mp3',
  },
];

// ---------------------------------------------------------------------------
// Retell voices (ElevenLabs / Retell platform)
//
// Voice IDs populated via: npx tsx fetch-retell-voices.ts
// Preview audio files saved to: public/audio/voices/retell-*.mp3
// ---------------------------------------------------------------------------

export const RETELL_AVAILABLE_VOICES: VoiceDefinition[] = [
  {
    id: 'retell-chloe',
    name: 'Chloe',
    subtitle: 'Warm Professional',
    provider: 'retell',
    voiceId: 'retell-Chloe',
    gender: 'female',
    accent: 'American',
    description: 'Warm and professional, perfect for welcoming callers',
    previewUrl: '/audio/voices/retell-chloe.mp3',
  },
  {
    id: 'retell-grace',
    name: 'Grace',
    subtitle: 'Calm & Caring',
    provider: 'retell',
    voiceId: 'inworld-Grace',
    gender: 'female',
    accent: 'American',
    description: 'Calm and caring, puts patients at ease',
    previewUrl: '/audio/voices/retell-grace.mp3',
  },
  {
    id: 'retell-kate',
    name: 'Kate',
    subtitle: 'Clear Communicator',
    provider: 'retell',
    voiceId: '11labs-Kate',
    gender: 'female',
    accent: 'American',
    description: 'Clear and articulate, excellent for detailed information',
    previewUrl: '/audio/voices/retell-kate.mp3',
  },
  {
    id: 'retell-victoria',
    name: 'Victoria',
    subtitle: 'Poised & Polished',
    provider: 'retell',
    voiceId: 'cartesia-Victoria',
    gender: 'female',
    accent: 'American',
    description: 'Polished and sophisticated, inspires confidence',
    previewUrl: '/audio/voices/retell-victoria.mp3',
  },
  {
    id: 'retell-brian',
    name: 'Brian',
    subtitle: 'Friendly Guide',
    provider: 'retell',
    voiceId: 'cartesia-Brian',
    gender: 'male',
    accent: 'American',
    description: 'Friendly and reliable, easy to understand',
    previewUrl: '/audio/voices/retell-brian.mp3',
  },
  {
    id: 'retell-joe',
    name: 'Joe',
    subtitle: 'Easygoing Helper',
    provider: 'retell',
    voiceId: '11labs-Joe',
    gender: 'male',
    accent: 'American',
    description: 'Relaxed and approachable, naturally conversational',
    previewUrl: '/audio/voices/retell-joe.mp3',
  },
  {
    id: 'retell-max',
    name: 'Max',
    subtitle: 'Confident & Direct',
    provider: 'retell',
    voiceId: 'minimax-Max',
    gender: 'male',
    accent: 'American',
    description: 'Confident and direct, efficient communicator',
    previewUrl: '/audio/voices/retell-max.mp3',
  },
];

/**
 * Get the voice list for a given provider.
 */
export function getVoicesForProvider(
  provider: 'VAPI' | 'RETELL',
): VoiceDefinition[] {
  return provider === 'RETELL'
    ? RETELL_AVAILABLE_VOICES
    : VAPI_AVAILABLE_VOICES;
}
