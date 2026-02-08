import { auth } from '@kit/shared/auth/nextauth';
import { getCognitoTokens } from '@kit/shared/auth/token-storage';

const DEFAULT_BACKEND_URL = 'http://localhost:4000';

function resolveBackendBaseUrl() {
  return (
    process.env.BACKEND_API_URL ??
    process.env.NEXT_PUBLIC_BACKEND_API_URL ??
    DEFAULT_BACKEND_URL
  );
}

async function resolveAccessToken() {
  const session = await auth();

  if (!session?.user) {
    throw new Error('User not authenticated');
  }

  const userId = (session.user as unknown as { id?: string })?.id;

  if (!userId) {
    throw new Error('User ID not found in session');
  }

  const tokens = await getCognitoTokens(userId);

  if (!tokens?.accessToken) {
    throw new Error('Unable to call backend API without a Cognito access token. Please sign in again.');
  }

  return tokens.accessToken;
}

export interface AccountListItem {
  id: string;
  name: string;
  email?: string;
  pictureUrl?: string;
  isPersonalAccount: boolean;
  primaryOwner: {
    id: string;
    email: string;
    displayName?: string;
    avatarUrl?: string;
  };
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchAccountsResponse {
  accounts: AccountListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ImpersonationSession {
  sessionToken: string;
  targetUser: {
    id: string;
    email: string;
    displayName?: string;
    avatarUrl?: string;
  };
  account?: {
    id: string;
    name: string;
  };
  startedAt: string;
}

export interface ImpersonationStatus {
  isImpersonating: boolean;
  sessionToken?: string;
  targetUser?: {
    id: string;
    email: string;
    displayName?: string;
  };
  admin?: {
    id: string;
    email: string;
    displayName?: string;
  };
  startedAt?: string;
}

export interface AdminAccess {
  id: string;
  admin: {
    id: string;
    email: string;
    displayName?: string;
  };
  grantedBy: {
    id: string;
    email: string;
    displayName?: string;
  };
  account?: {
    id: string;
    name: string;
  };
  grantedAt: string;
  revokedAt?: string;
  isRevoked: boolean;
  expiresAt?: string;
  notes?: string;
}

export interface AdminAccessList {
  access: AdminAccess[];
  total: number;
}

/**
 * Search accounts with pagination and filtering
 */
export async function searchAccounts(params?: {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}): Promise<SearchAccountsResponse> {
  const baseUrl = resolveBackendBaseUrl();
  const accessToken = await resolveAccessToken();

  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.append('search', params.search);
  if (params?.page) searchParams.append('page', params.page.toString());
  if (params?.limit) searchParams.append('limit', params.limit.toString());
  if (params?.sortBy) searchParams.append('sortBy', params.sortBy);
  if (params?.sortOrder) searchParams.append('sortOrder', params.sortOrder);

  const url = `${baseUrl}/admin/accounts?${searchParams.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to search accounts (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

/**
 * Start impersonating a user
 */
export async function startImpersonation(data: {
  targetUserId: string;
  accountId?: string;
}): Promise<ImpersonationSession> {
  const baseUrl = resolveBackendBaseUrl();
  const accessToken = await resolveAccessToken();

  const response = await fetch(`${baseUrl}/admin/impersonate/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to start impersonation (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

/**
 * End current impersonation session
 */
export async function endImpersonation(sessionToken: string): Promise<{ success: boolean; message: string }> {
  const baseUrl = resolveBackendBaseUrl();
  const accessToken = await resolveAccessToken();

  const response = await fetch(`${baseUrl}/admin/impersonate/end`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ sessionToken }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to end impersonation (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

/**
 * Get current impersonation status
 */
export async function getImpersonationStatus(): Promise<ImpersonationStatus> {
  const baseUrl = resolveBackendBaseUrl();
  const accessToken = await resolveAccessToken();

  const response = await fetch(`${baseUrl}/admin/impersonate/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to get impersonation status (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

/**
 * Grant admin access to a user
 */
export async function grantAdminAccess(data: {
  adminId: string;
  accountId?: string;
  expiresAt?: Date;
  notes?: string;
}): Promise<AdminAccess> {
  const baseUrl = resolveBackendBaseUrl();
  const accessToken = await resolveAccessToken();

  const response = await fetch(`${baseUrl}/admin/access/grant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to grant admin access (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

/**
 * Revoke admin access
 */
export async function revokeAdminAccess(data: {
  adminId: string;
  accountId?: string;
}): Promise<AdminAccess> {
  const baseUrl = resolveBackendBaseUrl();
  const accessToken = await resolveAccessToken();

  const response = await fetch(`${baseUrl}/admin/access/revoke`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to revoke admin access (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

/**
 * List admin access (for current user)
 */
export async function listAdminAccess(): Promise<AdminAccessList> {
  const baseUrl = resolveBackendBaseUrl();
  const accessToken = await resolveAccessToken();

  const response = await fetch(`${baseUrl}/admin/access/list`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to list admin access (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

/**
 * List granted access (access granted by current user to admins)
 */
export async function listGrantedAccess(): Promise<AdminAccessList> {
  const baseUrl = resolveBackendBaseUrl();
  const accessToken = await resolveAccessToken();

  const response = await fetch(`${baseUrl}/admin/access/granted`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to list granted access (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

