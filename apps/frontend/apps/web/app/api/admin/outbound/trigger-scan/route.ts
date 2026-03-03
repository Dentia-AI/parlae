import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { getLogger } from '@kit/shared/logger';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';

/**
 * POST /api/admin/outbound/trigger-scan
 *
 * Admin-only: manually trigger outbound scheduler scans for selected accounts.
 *
 * Body: {
 *   scanTypes: Array<'recall' | 'reminder' | 'noshow' | 'reactivation' | 'all'>;
 *   accountIds?: string[];  // if omitted, runs for all enabled accounts
 * }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const body = await request.json();
    const { scanTypes, accountIds } = body;

    if (!scanTypes?.length) {
      return NextResponse.json(
        { error: 'scanTypes is required' },
        { status: 400 },
      );
    }

    if (!BACKEND_URL) {
      return NextResponse.json(
        { error: 'Backend URL not configured' },
        { status: 500 },
      );
    }

    const res = await fetch(`${BACKEND_URL}/outbound/admin/trigger-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanTypes, accountIds }),
    });

    const data = await res.json();

    if (!res.ok) {
      logger.error(
        { status: res.status, data },
        '[Admin Outbound] Backend trigger-scan failed',
      );
      return NextResponse.json(
        { error: data.message || 'Backend request failed' },
        { status: res.status },
      );
    }

    logger.info(
      { totalAccounts: data.totalAccounts, scanTypes },
      '[Admin Outbound] Manual scan trigger completed',
    );

    return NextResponse.json(data);
  } catch (error) {
    logger.error({ error }, '[Admin Outbound] Trigger scan failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to trigger scan' },
      { status: 500 },
    );
  }
}
