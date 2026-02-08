import { NextResponse } from 'next/server';

/**
 * Lightweight health endpoint returning 200 so external load balancers
 * probing `/api/health` mark the service healthy without needing database access.
 */
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
