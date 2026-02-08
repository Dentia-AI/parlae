import { auth } from '@kit/shared/auth/nextauth';
import { getCognitoTokens } from '@kit/shared/auth/token-storage';

const DEFAULT_BACKEND_URL = 'http://localhost:4000';

interface BackendRequestOptions {
  accessToken?: string;
}

function resolveBackendBaseUrl() {
  return (
    process.env.BACKEND_API_URL ??
    process.env.NEXT_PUBLIC_BACKEND_API_URL ??
    DEFAULT_BACKEND_URL
  );
}

async function resolveAccessToken(options?: BackendRequestOptions) {
  if (options?.accessToken) {
    return options.accessToken;
  }

  const session = await auth();

  if (!session?.user) {
    throw new Error('User not authenticated');
  }

  const userId = (session.user as unknown as { id?: string })?.id;

  if (!userId) {
    throw new Error('User ID not found in session');
  }

  // Fetch tokens from database instead of session
  const tokens = await getCognitoTokens(userId);

  if (!tokens?.accessToken) {
    throw new Error('Unable to call backend API without a Cognito access token. Please sign in again.');
  }

  return tokens.accessToken;
}

export interface BackendStatusResponse {
  message: string;
  database: string;
  timestamp: string;
}

export interface BackendUserResponse {
  user: Record<string, unknown>;
}

/**
 * Example helper that calls the NestJS backend's GET / status endpoint.
 * This can be used inside server components, server actions, or API routes.
 */
export async function fetchBackendStatus(options?: BackendRequestOptions): Promise<BackendStatusResponse> {
  const baseUrl = resolveBackendBaseUrl();
  const accessToken = await resolveAccessToken(options);

  const response = await fetch(`${baseUrl}/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Backend status request failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as BackendStatusResponse;
}

export async function fetchBackendProfile(options?: BackendRequestOptions): Promise<BackendUserResponse> {
  const baseUrl = resolveBackendBaseUrl();
  const accessToken = await resolveAccessToken(options);

  const response = await fetch(`${baseUrl}/me`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Backend profile request failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as BackendUserResponse;
}

/**
 * Example POST helper that demonstrates sending JSON payloads to the backend.
 */
export async function postToBackend<TBody extends object, TResponse = unknown>(
  path: string,
  body: TBody,
  options?: BackendRequestOptions,
): Promise<TResponse> {
  const baseUrl = resolveBackendBaseUrl();
  const accessToken = await resolveAccessToken(options);

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Backend POST ${path} failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as TResponse;
}
