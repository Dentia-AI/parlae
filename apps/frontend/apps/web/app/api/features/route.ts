import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

const OUTBOUND_KEY_MAP: Record<string, string> = {
  'outbound-patient-care': 'patientCareEnabled',
  'outbound-financial': 'financialEnabled',
  'outbound-auto-approve': 'autoApproveCampaigns',
};

const OUTBOUND_KEYS = new Set([
  'outbound-calls',
  'outbound-patient-care',
  'outbound-financial',
  'outbound-auto-approve',
]);

const WIZARD_GATED_KEYS = new Set(['ai-receptionist', 'inbound-calls']);

async function getAccountPrerequisites(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      phoneIntegrationMethod: true,
      phoneIntegrationSettings: true,
      paymentMethodVerified: true,
    },
  });

  const settings = (account?.phoneIntegrationSettings as Record<string, unknown>) ?? {};
  const wizardCompleted = !!(
    account?.phoneIntegrationMethod &&
    account.phoneIntegrationMethod !== 'none' &&
    (settings.vapiSquadId || settings.retellReceptionistAgentId || settings.deployType === 'conversation_flow')
  );

  let pmsConnected = false;
  try {
    const pms = await prisma.pmsIntegration.findFirst({
      where: { accountId, status: 'ACTIVE' },
      select: { id: true },
    });
    pmsConnected = !!pms;
  } catch {
    // Table may not exist yet
  }

  return {
    wizardCompleted,
    paymentVerified: account?.paymentMethodVerified ?? false,
    pmsConnected,
  };
}

/**
 * GET /api/features
 * Returns the unified feature settings: featureSettings from accounts +
 * outbound toggle state from the outboundSettings table +
 * prerequisite statuses (wizardCompleted, paymentVerified, pmsConnected).
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

    const prerequisites = await getAccountPrerequisites(account.id);

    return NextResponse.json({
      featureSettings,
      ...prerequisites,
    });
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
 *
 * Guards:
 * - Enabling ai-receptionist or inbound-calls requires wizard completion
 * - Enabling any outbound toggle requires PMS + payment
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

    const enablingWizardGated = [...WIZARD_GATED_KEYS].some(
      (key) => featureSettings[key] === true,
    );
    const enablingOutbound = [...OUTBOUND_KEYS].some(
      (key) => featureSettings[key] === true,
    );

    if (enablingWizardGated || enablingOutbound) {
      const prereqs = await getAccountPrerequisites(account.id);

      if (enablingWizardGated && !prereqs.wizardCompleted) {
        return NextResponse.json(
          { error: 'Complete the setup wizard before enabling these features' },
          { status: 400 },
        );
      }

      if (enablingOutbound && (!prereqs.pmsConnected || !prereqs.paymentVerified)) {
        return NextResponse.json(
          { error: 'Connect your PMS and add a payment method before enabling outbound' },
          { status: 400 },
        );
      }
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
