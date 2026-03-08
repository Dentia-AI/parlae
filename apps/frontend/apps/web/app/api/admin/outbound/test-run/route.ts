import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { getLogger } from '@kit/shared/logger';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || '';

/**
 * GET /api/admin/outbound/test-run?campaignId=X&accountId=Y
 *
 * Admin-only: poll campaign and contact statuses for a test run.
 */
export async function GET(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');
    const accountId = searchParams.get('accountId');

    if (!campaignId || !accountId) {
      return NextResponse.json(
        { error: 'campaignId and accountId are required' },
        { status: 400 },
      );
    }

    if (!BACKEND_URL) {
      return NextResponse.json(
        { error: 'Backend URL not configured' },
        { status: 500 },
      );
    }

    const [campaignRes, contactsRes] = await Promise.all([
      fetch(`${BACKEND_URL}/outbound/campaigns/${accountId}/${campaignId}`),
      fetch(`${BACKEND_URL}/outbound/campaigns/${accountId}/${campaignId}/contacts`),
    ]);

    if (!campaignRes.ok) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const campaign = await campaignRes.json();
    const contacts = contactsRes.ok ? await contactsRes.json() : [];

    return NextResponse.json({ campaign, contacts });
  } catch (error) {
    logger.error({ error }, '[Admin Outbound] Test run status poll failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch status' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/outbound/test-run
 *
 * Admin-only: create a test campaign and dispatch calls immediately.
 *
 * Body: {
 *   accountId: string;
 *   callType: string;
 *   phoneNumbers: string[];
 * }
 */
export async function POST(request: NextRequest) {
  const logger = await getLogger();

  try {
    await requireAdmin();

    const body = await request.json();
    const { accountId, callType, phoneNumbers } = body;

    if (!accountId || !callType || !phoneNumbers?.length) {
      return NextResponse.json(
        { error: 'accountId, callType, and phoneNumbers are required' },
        { status: 400 },
      );
    }

    if (!BACKEND_URL) {
      return NextResponse.json(
        { error: 'Backend URL not configured' },
        { status: 500 },
      );
    }

    const res = await fetch(`${BACKEND_URL}/outbound/admin/test-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, callType, phoneNumbers }),
    });

    const data = await res.json();

    if (!res.ok) {
      logger.error(
        { status: res.status, data },
        '[Admin Outbound] Backend test-run failed',
      );
      return NextResponse.json(
        { error: data.message || 'Backend request failed' },
        { status: res.status },
      );
    }

    logger.info(
      { campaignId: data.campaignId, accountId, callType },
      '[Admin Outbound] Test run started',
    );

    return NextResponse.json(data);
  } catch (error) {
    logger.error({ error }, '[Admin Outbound] Test run failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start test run' },
      { status: 500 },
    );
  }
}
