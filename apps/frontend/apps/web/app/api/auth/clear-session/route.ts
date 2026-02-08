import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Clear all auth cookies - useful for development when NEXTAUTH_SECRET changes
 * Visit: http://localhost:3000/api/auth/clear-session
 */
export async function GET() {
  const cookieStore = await cookies();
  
  // Clear all NextAuth cookies
  const cookieNames = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'authjs.callback-url',
    '__Secure-authjs.callback-url',
    'authjs.csrf-token',
    '__Host-authjs.csrf-token',
    'authjs.pkce.code_verifier',
    '__Secure-authjs.pkce.code_verifier',
    'authjs.state',
    '__Secure-authjs.state',
    'authjs.nonce',
    '__Secure-authjs.nonce',
  ];

  for (const name of cookieNames) {
    cookieStore.delete(name);
  }

  return NextResponse.json({ 
    success: true, 
    message: 'All auth cookies cleared. You can now sign in again.',
    redirect: '/auth/sign-in'
  });
}
