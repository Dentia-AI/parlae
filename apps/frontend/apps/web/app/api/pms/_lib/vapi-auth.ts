/**
 * Vapi Webhook Authentication Utilities
 * Verifies Bearer Token from Vapi webhook requests
 */

/**
 * Verify Vapi Bearer Token authentication
 * @param request - The incoming request
 * @returns true if authenticated, false otherwise
 */
export function verifyVapiAuth(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return false;
  }

  // Check for Bearer token format
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const expectedToken = process.env.VAPI_WEBHOOK_SECRET;

  if (!expectedToken) {
    console.error('VAPI_WEBHOOK_SECRET not configured');
    return false;
  }

  return token === expectedToken;
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse() {
  return Response.json(
    { error: 'Unauthorized' },
    { status: 401 }
  );
}
