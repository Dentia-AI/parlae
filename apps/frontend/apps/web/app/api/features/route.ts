import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

const OUTBOUND_KEY_MAP: Record<string, string> = {
  'outbound-patient-care': 'patientCareEnabled',
  'outbound-financial': 'financialEnabled',
  'outbound-auto-approve': 'autoApproveCampaigns',
};

/**
 * GET /api/features
 * Returns the unified feature settings: featureSettings from accounts +
 * outbound toggle state from the outboundSettings table.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const userId = session.user?.id;

    const account = userId
      ? await prisma.account.findFirst({
          where: { primaryOwnerId: userId, isPersonalAccount: true },
          select: { id: true, featureSettings: true },
        })
      : null;

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const featureSettings = (account.featureSettings as Record<string, boolean>) ?? {};

    let outboundSettings: { patientCareEnabled: boolean; financialEnabled: boolean } | null = null;
    try {
      outboundSettings = await prisma.outboundSettings.findUnique({
        where: { accountId: account.id },
        select: { patientCareEnabled: true, financialEnabled: true },
      });
    } catch {
      // Table may not exist yet
    }

    if (outboundSettings) {
      featureSettings['outbound-patient-care'] = outboundSettings.patientCareEnabled;
      featureSettings['outbound-financial'] = outboundSettings.financialEnabled;
      featureSettings['outbound-calls'] =
        outboundSettings.patientCareEnabled || outboundSettings.financialEnabled;

      try {
        const autoApprove = await prisma.outboundSettings.findUnique({
          where: { accountId: account.id },
          select: { autoApproveCampaigns: true },
        });
        if (autoApprove) {
          featureSettings['outbound-auto-approve'] = autoApprove.autoApproveCampaigns;
        }
      } catch {
        // Column may not exist yet
      }
    }

    return NextResponse.json({ featureSettings });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching feature settings:', error);
    return NextResponse.json({ error: 'Failed to fetch feature settings' }, { status: 500 });
  }
}

/**
 * PUT /api/features
 * Updates feature settings on the accounts table AND syncs outbound-related
 * toggles to the outboundSettings table (the backend's operational source).
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;

    const body = await request.json();
    const { featureSettings } = body;

    if (!featureSettings || typeof featureSettings !== 'object') {
      return NextResponse.json(
        { error: 'Invalid feature settings' },
        { status: 400 },
      );
    }

    const account = userId
      ? await prisma.account.findFirst({
          where: { primaryOwnerId: userId, isPersonalAccount: true },
          select: { id: true },
        })
      : null;

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await prisma.account.update({
      where: { id: account.id },
      data: { featureSettings },
    });

    const outboundUpdates: Record<string, boolean> = {};
    for (const [featureKey, dbField] of Object.entries(OUTBOUND_KEY_MAP)) {
      if (featureSettings[featureKey] !== undefined) {
        outboundUpdates[dbField] = featureSettings[featureKey];
      }
    }

    if (Object.keys(outboundUpdates).length > 0) {
      try {
        await prisma.outboundSettings.upsert({
          where: { accountId: account.id },
          update: outboundUpdates,
          create: { accountId: account.id, ...outboundUpdates },
        });
      } catch {
        // outboundSettings table may not exist yet in some environments
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error updating feature settings:', error);
    return NextResponse.json({ error: 'Failed to update feature settings' }, { status: 500 });
  }
}
