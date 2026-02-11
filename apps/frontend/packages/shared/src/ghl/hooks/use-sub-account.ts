import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface CreateSubAccountData {
  businessName: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  businessWebsite?: string;
  timezone?: string;
  industry?: string;
  firstName?: string;
  lastName?: string;
  country?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface SubAccount {
  id: string;
  userId: string;
  accountId?: string;
  ghlLocationId: string;
  ghlCompanyId?: string;
  businessName: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  businessWebsite?: string;
  timezone?: string;
  industry?: string;
  status: 'pending' | 'active' | 'suspended' | 'deleted';
  setupCompleted: boolean;
  setupStep: number;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
  voiceAgents?: Array<{
    id: string;
    name: string;
    status: string;
    phoneNumber?: string;
  }>;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

/**
 * Fetch sub-account data
 */
async function fetchSubAccount(): Promise<SubAccount | null> {
  const response = await fetch(`${BACKEND_URL}/ghl/sub-accounts/my`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error('Failed to fetch sub-account');
  }

  const result = await response.json();
  return result.data;
}

/**
 * Create a new sub-account
 */
async function createSubAccount(
  data: CreateSubAccountData,
): Promise<SubAccount> {
  const response = await fetch(`${BACKEND_URL}/ghl/sub-accounts`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create sub-account');
  }

  const result = await response.json();
  return result.data;
}

/**
 * Update sub-account
 */
async function updateSubAccount(
  id: string,
  data: Partial<CreateSubAccountData>,
): Promise<SubAccount> {
  const response = await fetch(`${BACKEND_URL}/ghl/sub-accounts/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to update sub-account');
  }

  const result = await response.json();
  return result.data;
}

/**
 * Update setup step
 */
async function updateSetupStep(
  id: string,
  setupStep: number,
  completed: boolean = false,
): Promise<SubAccount> {
  const response = await fetch(
    `${BACKEND_URL}/ghl/sub-accounts/${id}/setup-step`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ setupStep, completed }),
    },
  );

  if (!response.ok) {
    throw new Error('Failed to update setup step');
  }

  const result = await response.json();
  return result.data;
}

/**
 * Hook to get current user's sub-account
 */
export function useSubAccount() {
  return useQuery<SubAccount | null>({
    queryKey: ['sub-account'],
    queryFn: fetchSubAccount,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to create a new sub-account
 */
export function useCreateSubAccount() {
  const queryClient = useQueryClient();

  return useMutation<SubAccount, Error, CreateSubAccountData>({
    mutationFn: createSubAccount,
    onSuccess: (data) => {
      // Invalidate and refetch sub-account query
      queryClient.setQueryData(['sub-account'], data);
      queryClient.invalidateQueries({ queryKey: ['sub-account'] });
    },
  });
}

/**
 * Hook to update sub-account
 */
export function useUpdateSubAccount() {
  const queryClient = useQueryClient();

  return useMutation<
    SubAccount,
    Error,
    { id: string; data: Partial<CreateSubAccountData> }
  >({
    mutationFn: ({ id, data }) => updateSubAccount(id, data),
    onSuccess: (data) => {
      queryClient.setQueryData(['sub-account'], data);
      queryClient.invalidateQueries({ queryKey: ['sub-account'] });
    },
  });
}

/**
 * Hook to update setup step
 */
export function useUpdateSetupStep() {
  const queryClient = useQueryClient();

  return useMutation<
    SubAccount,
    Error,
    { id: string; setupStep: number; completed?: boolean }
  >({
    mutationFn: ({ id, setupStep, completed }) =>
      updateSetupStep(id, setupStep, completed),
    onSuccess: (data) => {
      queryClient.setQueryData(['sub-account'], data);
      queryClient.invalidateQueries({ queryKey: ['sub-account'] });
    },
  });
}


