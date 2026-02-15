import { auth } from '@kit/shared/auth/nextauth';

/**
 * Get the current user session on the server
 * Returns null if no session exists
 */
export async function getSession() {
  return await auth();
}

/**
 * Get the current user from session
 * Returns null if no session exists
 */
export async function getUser() {
  const session = await auth();
  return session?.user || null;
}

/**
 * Get the current user session and throw if not authenticated
 * Use this in API routes that require authentication
 */
export async function requireSession() {
  const session = await getSession();
  
  if (!session || !session.user) {
    throw new Error('Unauthorized');
  }
  
  return session;
}
