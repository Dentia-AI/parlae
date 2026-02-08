const FALLBACK_APP_HOST = 'app.dentiaapp.com';

function getPrimaryAppHost() {
  const APP_HOSTS_ENV = process.env.APP_HOSTS ?? process.env.APP_HOST ?? '';
  const parsedHosts = APP_HOSTS_ENV.split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return parsedHosts[0] ?? FALLBACK_APP_HOST;
}

export function getAppUrl(path: string = '/') {
  // Check if we're running on the client side
  if (typeof window !== 'undefined') {
    // On client side, use current location to determine base URL
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const port = window.location.port;
    const protocol = window.location.protocol;

    if (isLocalhost && port) {
      // Use current localhost URL
      const appBaseUrl = `${protocol}//${window.location.hostname}:${port}`;

      if (!path) {
        return appBaseUrl;
      }

      if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
      }

      if (!path.startsWith('/')) {
        return `${appBaseUrl}/${path}`;
      }

      return `${appBaseUrl}${path}`;
    }
  }

  // Server side or fallback - read environment variables
  const APP_HOSTS_ENV = process.env.APP_HOSTS ?? process.env.APP_HOST ?? '';
  const parsedHosts = APP_HOSTS_ENV.split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const primaryAppHost = parsedHosts[0] ?? 'app.dentiaapp.com';
  const appBaseUrl = `https://${primaryAppHost}`;

  if (!path) {
    return appBaseUrl;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (!path.startsWith('/')) {
    return `${appBaseUrl}/${path}`;
  }

  return `${appBaseUrl}${path}`;
}

// Keep these for backward compatibility but they will use build-time values
export const primaryAppHost = 'app.dentiaapp.com';
export const appBaseUrl = 'https://app.dentiaapp.com';
