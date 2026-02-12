import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { auth } from '@kit/shared/auth';

const DEFAULT_ALLOWED_RETURN_URLS = [
  'https://hub.parlae.ca/session/sso_login',
  'https://hub.parlae.com/session/sso_login',
  'https://hub.parlae.ai/session/sso_login',
  'https://hub.parlae.app/session/sso_login',
];
const SSO_SECRET = process.env.DISCOURSE_SSO_SECRET;
const ALLOWED_RETURN_URLS = (process.env.DISCOURSE_SSO_ALLOWED_RETURN_URLS ?? DEFAULT_ALLOWED_RETURN_URLS.join(','))
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

function assertSecret() {
  if (!SSO_SECRET) {
    throw new Error('DISCOURSE_SSO_SECRET is not configured');
  }
}

function hmacSignature(payload: string) {
  assertSecret();
  return crypto.createHmac('sha256', SSO_SECRET as string).update(payload).digest('hex');
}

function secureCompare(expected: string, actual: string) {
  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(actual.toLowerCase(), 'hex');

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

function sanitizeUsername(value: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-.]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 30);

  return sanitized || `user_${Date.now()}`;
}

function validateReturnUrl(url: string) {
  try {
    const parsed = new URL(url);
    return ALLOWED_RETURN_URLS.some((allowed) => {
      try {
        const allowedUrl = new URL(allowed);
        return parsed.origin === allowedUrl.origin && parsed.pathname === allowedUrl.pathname;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const ssoPayload = url.searchParams.get('sso');
  const signature = url.searchParams.get('sig');

  if (!ssoPayload || !signature) {
    return new NextResponse('Missing SSO payload', { status: 400 });
  }

  const expectedSig = hmacSignature(ssoPayload);

  if (!secureCompare(expectedSig, signature)) {
    return new NextResponse('Invalid SSO signature', { status: 403 });
  }

  const decoded = Buffer.from(ssoPayload, 'base64').toString('utf8');
  const payload = new URLSearchParams(decoded);
  const nonce = payload.get('nonce');
  const returnUrl = payload.get('return_sso_url');

  if (!nonce || !returnUrl) {
    return new NextResponse('Invalid SSO payload', { status: 400 });
  }

  if (!validateReturnUrl(returnUrl)) {
    return new NextResponse('Untrusted return URL', { status: 400 });
  }

  const session = await auth();

  if (!session?.user?.email || !session.user.id) {
    const loginUrl = new URL('/auth/sign-in', url.origin);
    loginUrl.searchParams.set('next', `${url.pathname}${url.search}`);
    return NextResponse.redirect(loginUrl.toString(), { status: 302 });
  }

  const email = session.user.email.toLowerCase();
  const externalId = session.user.id;
  const preferredUsername =
    (session.user as Record<string, unknown>).username as string | undefined;
  const username = sanitizeUsername(preferredUsername ?? email.split('@')[0]);
  const name = session.user.name ?? email.split('@')[0];

  const responsePayload = new URLSearchParams({
    nonce,
    email,
    external_id: externalId,
    username,
    name,
    email_verified: 'true',
    require_activation: 'false',
  });

  const encodedResponse = Buffer.from(responsePayload.toString()).toString('base64');
  const responseSignature = hmacSignature(encodedResponse);

  const redirectUrl = new URL(returnUrl);
  redirectUrl.searchParams.set('sso', encodedResponse);
  redirectUrl.searchParams.set('sig', responseSignature);

  return NextResponse.redirect(redirectUrl.toString(), { status: 302, headers: { 'Cache-Control': 'no-store' } });
}
