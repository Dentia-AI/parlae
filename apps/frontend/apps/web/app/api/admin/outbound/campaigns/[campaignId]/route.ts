import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { getLogger } from '@kit/shared/logger';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';

/**
 * DELETE /api/admin/outbound/campaigns/:campaignId
 *
 * Admin-only: permanently delete a campaign and its contacts.
 * Only allowed for DRAFT, PAUSED, COMPLETED, or CANCELLED campaigns.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const { campaignId } = await params;

    if (!BACKEND_URL) {
      return NextResponse.json(
        { error: 'Backend URL not configured' },
        { status: 500 },
      );
    }

    const res = await fetch(
      `${BACKEND_URL}/outbound/admin/campaigns/${campaignId}`,
      { method: 'DELETE' },
    );

    const data = await res.json();

    if (!res.ok) {
      logger.error(
        { status: res.status, data },
        '[Admin Outbound] Backend campaign delete failed',
      );
      return NextResponse.json(
        { error: data.message || 'Backend request failed' },
        { status: res.status },
      );
    }

    logger.info(
      { campaignId },
      '[Admin Outbound] Campaign deleted',
    );

    return NextResponse.json(data);
  } catch (error) {
    logger.error({ error }, '[Admin Outbound] Campaign delete failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete campaign' },
      { status: 500 },
    );
  }
}
