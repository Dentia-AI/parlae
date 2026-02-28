const FALLBACK_APP_HOST = 'app.parlae.ca';

function getPrimaryAppHost() {
  const APP_HOSTS_ENV = process.env.APP_HOSTS ?? process.env.APP_HOST ?? '';
  const parsedHosts = APP_HOSTS_ENV.split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return parsedHosts[0] ?? FALLBACK_APP_HOST;
}

function buildUrl(baseUrl: string, path: string) {
  if (!path) return baseUrl;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!path.startsWith('/')) return `${baseUrl}/${path}`;
  return `${baseUrl}${path}`;
}

export function getAppUrl(path: string = '/') {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (isLocalhost && window.location.port) {
      return buildUrl(
        `${window.location.protocol}//${hostname}:${window.location.port}`,
        path,
      );
    }
  }

  const appBaseUrl = `https://${getPrimaryAppHost()}`;
  return buildUrl(appBaseUrl, path);
}

/**
 * Server-side variant that reads the incoming request host header so
 * redirects stay on localhost during development instead of jumping to
 * the production APP_HOSTS domain.
 */
export async function getAppUrlFromRequest(path: string = '/') {
  if (typeof window !== 'undefined') {
    return getAppUrl(path);
  }

  try {
    const { headers: getHeaders } = await import('next/headers');
    const headerStore = await getHeaders();
    const host = headerStore.get('host') ?? headerStore.get('x-forwarded-host');

    if (host) {
      const hostname = host.split(':')[0]?.toLowerCase() ?? '';
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

      if (isLocalhost) {
        const proto = headerStore.get('x-forwarded-proto') ?? 'http';
        return buildUrl(`${proto}://${host}`, path);
      }
    }
  } catch {
    // headers() not available outside request context; fall through
  }

  const appBaseUrl = `https://${getPrimaryAppHost()}`;
  return buildUrl(appBaseUrl, path);
}

// Keep these for backward compatibility but they will use build-time values
export const primaryAppHost = 'app.parlae.ca';
export const appBaseUrl = 'https://app.parlae.ca';
