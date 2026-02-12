import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { CsrfError, createCsrfProtect } from '@edge-csrf/nextjs';
import { getToken } from 'next-auth/jwt';

import appConfig from '~/config/app.config';
import pathsConfig from '~/config/paths.config';
import { isAdminUser } from '~/lib/auth/admin';

const CSRF_SECRET_COOKIE = 'csrfSecret';
const NEXT_ACTION_HEADER = 'next-action';
const IMPERSONATOR_COOKIE = 'impersonator-id';
const DEFAULT_APP_HOST = 'app.parlae.ca';
const DEFAULT_MARKETING_HOST = 'www.parlae.ca';
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';

const marketingExactPaths = new Set<string>([
  '/',
  '/faq',
  '/blog',
  '/book',
  '/docs',
  '/pricing',
  '/contact',
  '/cookie-policy',
  '/terms-of-service',
  '/privacy-policy',
]);

const marketingPrefixes = ['/blog', '/docs', '/legal', '/changelog'];

function parseHostList(value: string | undefined, fallback: string[]) {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  const hosts = value
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return hosts.length > 0 ? hosts : fallback;
}

const APP_HOSTS = parseHostList(
  process.env.APP_HOSTS ?? process.env.APP_HOST,
  [DEFAULT_APP_HOST],
);
const MARKETING_HOSTS = parseHostList(
  process.env.MARKETING_HOSTS ?? process.env.MARKETING_HOST,
  [DEFAULT_MARKETING_HOST],
);

const APP_HOST_SET = new Set(APP_HOSTS);
const MARKETING_HOST_SET = new Set(MARKETING_HOSTS);
const PRIMARY_APP_HOST = APP_HOSTS[0];
const PRIMARY_MARKETING_HOST = MARKETING_HOSTS[0];

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|images|locales|assets).*)',
    '/api/auth/:path*',
  ],
};

const CF_FORWARDED_PROTO_HEADER = 'cloudfront-forwarded-proto';
const HTTPS_HOST_ALLOWLIST = new Set<string>([
  ...APP_HOSTS,
  ...MARKETING_HOSTS,
  DEFAULT_APP_HOST,
  DEFAULT_MARKETING_HOST,
]);

function pickFirstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() ?? null;
}

function extractHostParts(value: string | null) {
  const raw = pickFirstHeaderValue(value);

  if (!raw) {
    return { host: null as string | null, port: null as string | null };
  }

  if (raw.startsWith('[')) {
    const closingIndex = raw.indexOf(']');

    if (closingIndex !== -1) {
      const hostPart = raw.slice(0, closingIndex + 1);
      const portPart = raw.slice(closingIndex + 1).replace(/^:/, '') || null;

      return { host: hostPart, port: portPart };
    }
  }

  const [hostPart, portPart] = raw.split(':', 2);

  return {
    host: hostPart ?? null,
    port: portPart ?? null,
  };
}

function normalizeForwardedRequest(request: NextRequest) {
  const headers = new Headers(request.headers);
  const forwardedHostParts = extractHostParts(headers.get('x-forwarded-host'));
  const requestHostParts = extractHostParts(headers.get('host'));
  const baseHost = forwardedHostParts.host ?? requestHostParts.host ?? PRIMARY_APP_HOST;
  const normalizedHost = baseHost.toLowerCase();

  const cfProto = pickFirstHeaderValue(headers.get(CF_FORWARDED_PROTO_HEADER));
  const forwardedProto = pickFirstHeaderValue(headers.get('x-forwarded-proto'));
  let protocol =
    cfProto ??
    forwardedProto ??
    request.nextUrl.protocol.replace(':', '') ??
    'https';

  const shouldForceHttps = HTTPS_HOST_ALLOWLIST.has(normalizedHost);

  if (shouldForceHttps) {
    protocol = 'https';
  }

  let port =
    pickFirstHeaderValue(headers.get('x-forwarded-port')) ??
    forwardedHostParts.port ??
    requestHostParts.port;

  if (!port) {
    port = protocol === 'https' ? '443' : request.nextUrl.port || '80';
  }

  if (protocol === 'https' && (port === '80' || port === '')) {
    port = '443';
  }

  const isDefaultHttps =
    protocol === 'https' && (port === '443' || port === '');
  const isDefaultHttp =
    protocol === 'http' && (port === '80' || port === '');
  const shouldIncludePort = !(isDefaultHttps || isDefaultHttp);
  const hostWithPort = shouldIncludePort ? `${baseHost}:${port}` : baseHost;

  request.nextUrl.protocol = `${protocol}:`;
  request.nextUrl.host = baseHost;
  request.nextUrl.port = shouldIncludePort ? port : '';

  // Set x-forwarded-host - include port for localhost in development to match Origin header
  headers.set('host', hostWithPort);
  // In development on localhost, include port for Server Actions to work
  const forwardedHost = (normalizedHost.includes('localhost') && shouldIncludePort) ? hostWithPort : baseHost;
  headers.set('x-forwarded-host', forwardedHost);
  headers.set('x-forwarded-proto', protocol);
  headers.set('x-forwarded-port', shouldIncludePort ? port : protocol === 'https' ? '443' : '80');

  return headers;
}

async function getSessionUserId(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: SESSION_COOKIE_NAME,
  });

  // Log all session-related cookies for debugging chunked tokens
  if (process.env.NODE_ENV === 'development') {
    const sessionCookies = request.cookies
      .getAll()
      .filter((c) => c.name.includes(SESSION_COOKIE_NAME));
    
    console.log(JSON.stringify({
      message: '[Middleware][getSessionUserId]',
      hasToken: !!token,
      hasSub: !!token?.sub,
      sub: token?.sub,
      tokenEmail: token?.email,
      url: request.url,
      sessionCookies: sessionCookies.map(c => ({ 
        name: c.name, 
        length: c.value.length 
      })),
      allCookies: request.cookies.getAll().map(c => ({ name: c.name, hasValue: !!c.value })),
    }));
  }

  if (!token?.sub) {
    return null;
  }

  return token.sub as string;
}

function getImpersonatorId(request: NextRequest) {
  return request.cookies.get(IMPERSONATOR_COOKIE)?.value ?? null;
}

export async function proxy(request: NextRequest) {
  const normalizedHeaders = normalizeForwardedRequest(request);

  const hostRedirect = maybeRedirectHost(request);

  if (hostRedirect) {
    return hostRedirect;
  }

  const secureHeaders = await createResponseWithSecureHeaders();
  const response = NextResponse.next({
    request: {
      headers: normalizedHeaders,
    },
  });

  if (secureHeaders) {
    secureHeaders.forEach((value, key) => {
      response.headers.set(key, value);
    });
  }

  setRequestId(request);

  const csrfResponse = shouldBypassCsrf(request)
    ? response
    : await withCsrfMiddleware(request, response);
  const handler = await matchUrlPattern(request.url);

  if (handler) {
    const result = await handler(request);

    if (result) {
      return result;
    }
  }

  if (isServerAction(request)) {
    csrfResponse.headers.set('x-action-path', request.nextUrl.pathname);
  }

  return csrfResponse;
}

async function withCsrfMiddleware(
  request: NextRequest,
  response: NextResponse,
) {
  const csrfProtect = createCsrfProtect({
    cookie: {
      secure: appConfig.production,
      name: CSRF_SECRET_COOKIE,
    },
    ignoreMethods: isServerAction(request)
      ? ['POST']
      : ['GET', 'HEAD', 'OPTIONS'],
  });

  try {
    await csrfProtect(request, response);

    return response;
  } catch (error) {
    if (error instanceof CsrfError) {
      return NextResponse.json('Invalid CSRF token', {
        status: 401,
      });
    }

    throw error;
  }
}

function shouldBypassCsrf(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith('/api/auth')) {
    return true;
  }

  return false;
}

function isServerAction(request: NextRequest) {
  const headers = new Headers(request.headers);

  return headers.has(NEXT_ACTION_HEADER);
}

async function adminMiddleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/admin')) {
    return;
  }

  const sessionUserId = await getSessionUserId(request);
  const impersonatorId = getImpersonatorId(request);
  const effectiveAdminId = impersonatorId ?? sessionUserId;

  if (!effectiveAdminId || !isAdminUser(effectiveAdminId)) {
    return NextResponse.redirect(new URL('/404', request.nextUrl.origin));
  }

  if (!sessionUserId) {
    return NextResponse.redirect(
      new URL(pathsConfig.auth.signIn, request.nextUrl.origin),
    );
  }

  return;
}

async function authMiddleware(request: NextRequest) {
  const sessionUserId = await getSessionUserId(request);

  if (!sessionUserId) {
    return;
  }

  const nextPath =
    request.nextUrl.searchParams.get('next') ?? pathsConfig.app.home;

  return NextResponse.redirect(new URL(nextPath, request.nextUrl.origin));
}

async function homeMiddleware(request: NextRequest) {
  const sessionUserId = await getSessionUserId(request);

  if (process.env.NODE_ENV === 'development') {
    console.log(JSON.stringify({
      message: '[Middleware][homeMiddleware]',
      hasSession: !!sessionUserId,
      userId: sessionUserId,
      path: request.nextUrl.pathname,
    }));
  }

  if (sessionUserId) {
    return;
  }

  const signIn = pathsConfig.auth.signIn;
  const redirectPath = `${signIn}?next=${request.nextUrl.pathname}`;

  if (process.env.NODE_ENV === 'development') {
    console.log(JSON.stringify({
      message: '[Middleware][homeMiddleware] Redirecting to sign-in',
      from: request.nextUrl.pathname,
      to: redirectPath,
    }));
  }

  return NextResponse.redirect(new URL(redirectPath, request.nextUrl.origin));
}

async function getPatterns() {
  let URLPattern = globalThis.URLPattern;

  if (!URLPattern) {
    const { URLPattern: polyfill } = await import('urlpattern-polyfill');
    URLPattern = polyfill as typeof URLPattern;
  }

  return [
    {
      pattern: new URLPattern({ pathname: '/admin/*?' }),
      handler: adminMiddleware,
    },
    {
      pattern: new URLPattern({ pathname: '/auth/*?' }),
      handler: authMiddleware,
    },
    {
      pattern: new URLPattern({ pathname: '/home/*?' }),
      handler: homeMiddleware,
    },
  ];
}

async function matchUrlPattern(url: string) {
  const patterns = await getPatterns();
  const input = url.split('?')[0];

  for (const pattern of patterns) {
    const match = pattern.pattern.exec(input);

    if (match !== null && 'pathname' in match) {
      return pattern.handler;
    }
  }
}

function setRequestId(request: Request) {
  request.headers.set('x-correlation-id', crypto.randomUUID());
}

async function createResponseWithSecureHeaders() {
  const enableStrictCsp = process.env.ENABLE_STRICT_CSP ?? 'false';

  if (enableStrictCsp === 'false') {
    return undefined;
  }

  const { createCspResponse } = await import('./lib/create-csp-response');

  const response = await createCspResponse();

  if (!response) {
    return undefined;
  }

  return response.headers;
}

function maybeRedirectHost(request: NextRequest) {
  const host = request.headers.get('host');

  if (!host) {
    return null;
  }

  const normalizedHost = host.toLowerCase();

  if (normalizedHost.includes('localhost') || normalizedHost.endsWith('.vercel.app')) {
    return null;
  }

  const isKnownHost = APP_HOST_SET.has(normalizedHost) || MARKETING_HOST_SET.has(normalizedHost);

  if (!isKnownHost) {
    const url = new URL(request.url);
    url.host = PRIMARY_APP_HOST;
    url.protocol = 'https:';

    return NextResponse.redirect(url, 308);
  }

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return null;
  }

  if (MARKETING_HOST_SET.has(normalizedHost) && !isMarketingPath(pathname)) {
    const url = new URL(request.url);
    url.host = PRIMARY_APP_HOST;
    url.protocol = 'https:';

    return NextResponse.redirect(url, 308);
  }

  if (APP_HOST_SET.has(normalizedHost) && isMarketingPath(pathname)) {
    const url = new URL(request.url);
    url.host = PRIMARY_MARKETING_HOST;
    url.protocol = 'https:';

    return NextResponse.redirect(url, 308);
  }

  return null;
}

function isMarketingPath(pathname: string) {
  if (marketingExactPaths.has(pathname)) {
    return true;
  }

  return marketingPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Export proxy as default (Next.js 16 requires default export)
export default proxy;
