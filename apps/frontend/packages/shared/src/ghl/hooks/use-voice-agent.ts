import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3333';

export interface VoiceAgentConfig {
  name: string;
  voiceId: string;
  voiceName?: string;
  phoneNumber?: string;
  language?: string;
  prompt?: string;
  greetingMessage?: string;
}

export interface VoiceAgent {
  id: string;
  subAccountId: string;
  name: string;
  voiceId: string;
  voiceName?: string;
  phoneNumber?: string;
  language: string;
  prompt: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  isDeployed: boolean;
  createdAt: string;
  deployedAt?: string;
}

export interface Voice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  language: string;
  accent?: string;
  description?: string;
  previewUrl?: string;
}

export interface PhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  areaCode: string;
  city?: string;
  state?: string;
  country: string;
  monthlyPrice?: number;
  available: boolean;
}

// Fetch available voices
async function fetchVoices(): Promise<Voice[]> {
  const response = await fetch(`${BACKEND_URL}/ghl/voices`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch voices');
  }

  const result = await response.json();
  return result.data;
}

// Fetch available phone numbers
async function fetchPhoneNumbers(areaCode?: string, state?: string): Promise<PhoneNumber[]> {
  const params = new URLSearchParams();
  if (areaCode) params.append('areaCode', areaCode);
  if (state) params.append('state', state);

  const response = await fetch(
    `${BACKEND_URL}/ghl/phone-numbers?${params}`,
    { credentials: 'include' },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch phone numbers');
  }

  const result = await response.json();
  return result.data;
}

// Create voice agent
async function createVoiceAgent(
  subAccountId: string,
  config: VoiceAgentConfig,
): Promise<VoiceAgent> {
  const response = await fetch(`${BACKEND_URL}/ghl/voice-agents`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subAccountId, config }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create voice agent');
  }

  const result = await response.json();
  return result.data;
}

// Deploy voice agent
async function deployVoiceAgent(voiceAgentId: string): Promise<VoiceAgent> {
  const response = await fetch(
    `${BACKEND_URL}/ghl/voice-agents/${voiceAgentId}/deploy`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to deploy voice agent');
  }

  const result = await response.json();
  return result.data;
}

// Hooks
export function useVoices() {
  return useQuery<Voice[]>({
    queryKey: ['voices'],
    queryFn: fetchVoices,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function usePhoneNumbers(areaCode?: string, state?: string) {
  return useQuery<PhoneNumber[]>({
    queryKey: ['phone-numbers', areaCode, state],
    queryFn: () => fetchPhoneNumbers(areaCode, state),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCreateVoiceAgent() {
  const queryClient = useQueryClient();

  return useMutation<
    VoiceAgent,
    Error,
    { subAccountId: string; config: VoiceAgentConfig }
  >({
    mutationFn: ({ subAccountId, config }) =>
      createVoiceAgent(subAccountId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-agents'] });
    },
  });
}

export function useDeployVoiceAgent() {
  const queryClient = useQueryClient();

  return useMutation<VoiceAgent, Error, string>({
    mutationFn: deployVoiceAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voice-agents'] });
    },
  });
}
