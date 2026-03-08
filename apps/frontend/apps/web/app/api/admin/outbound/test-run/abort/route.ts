import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { getLogger } from '@kit/shared/logger';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';

/**
 * POST /api/admin/outbound/test-run/abort
 *
 * Admin-only: abort an active test-run campaign.
 *
 * Body: { campaignId: string }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const body = await request.json();
    const { campaignId } = body;

    if (!campaignId) {
      return NextResponse.json(
        { error: 'campaignId is required' },
        { status: 400 },
      );
    }

    if (!BACKEND_URL) {
      return NextResponse.json(
        { error: 'Backend URL not configured' },
        { status: 500 },
      );
    }

    const res = await fetch(
      `${BACKEND_URL}/outbound/admin/test-run/${campaignId}/abort`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const data = await res.json();

    if (!res.ok) {
      logger.error(
        { status: res.status, data },
        '[Admin Outbound] Backend test-run abort failed',
      );
      return NextResponse.json(
        { error: data.message || 'Backend request failed' },
        { status: res.status },
      );
    }

    logger.info(
      { campaignId, cancelledContacts: data.cancelledContacts },
      '[Admin Outbound] Test run aborted',
    );

    return NextResponse.json(data);
  } catch (error) {
    logger.error({ error }, '[Admin Outbound] Test run abort failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to abort test run' },
      { status: 500 },
    );
  }
}
