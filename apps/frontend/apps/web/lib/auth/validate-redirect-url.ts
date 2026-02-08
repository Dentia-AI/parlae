/**
 * Validates if a redirect URL is safe for use in authentication flows
 * Only allows redirects to Dentia domains over HTTPS
 * 
 * This prevents open redirect vulnerabilities while supporting
 * unified auth flow between app.dentiaapp.com and hub.dentiaapp.com
 */
export function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Whitelist of allowed domains
    const allowedDomains = [
      'dentiaapp.com',
      'dentia.co',
      'dentia.app',
      'dentia.ca',
    ];
    
    // Check if hostname ends with an allowed domain
    const isAllowedDomain = allowedDomains.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith('.' + domain),
    );
    
    // Only allow HTTPS in production (allow localhost for development)
    const isSecure =
      parsed.protocol === 'https:' ||
      (process.env.NODE_ENV === 'development' && parsed.hostname === 'localhost');
    
    return isAllowedDomain && isSecure;
  } catch {
    // Invalid URL
    return false;
  }
}

