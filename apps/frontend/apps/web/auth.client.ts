import { createAuthClient } from 'next-auth/client';

export const { signIn, signOut, useSession } = createAuthClient({
  baseUrl: process.env.NEXT_PUBLIC_NEXTAUTH_URL || 'http://localhost:3009',
});
