import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

async function getAccountId(userId: string) {
  const account = await prisma.account.findFirst({
    where: { primaryOwnerId: userId, isPersonalAccount: true },
    select: { id: true },
  });
  return account?.id ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(userId);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const { id: campaignId } = await params;
    const { action, contactIds } = await request.json();

    if (!action || !contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: 'action and contactIds[] required' }, { status: 400 });
    }

    const campaign = await prisma.outboundCampaign.findFirst({
      where: { id: campaignId, accountId },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (action === 'remove') {
      const deleted = await prisma.campaignContact.deleteMany({
        where: { id: { in: contactIds }, campaignId },
      });

      await prisma.outboundCampaign.update({
        where: { id: campaignId },
        data: { totalContacts: { decrement: deleted.count } },
      });

      return NextResponse.json({ removed: deleted.count });
    }

    if (action === 'add_to_dnc') {
      const contacts = await prisma.campaignContact.findMany({
        where: { id: { in: contactIds }, campaignId },
        select: { id: true, phoneNumber: true },
      });

      const phonesToAdd = contacts
        .map((c) => c.phoneNumber)
        .filter((p): p is string => !!p);

      let dncAdded = 0;
      for (const phone of phonesToAdd) {
        try {
          await prisma.doNotCallEntry.upsert({
            where: { accountId_phoneNumber: { accountId, phoneNumber: phone } },
            update: { reason: 'campaign_removed' },
            create: {
              accountId,
              phoneNumber: phone,
              reason: 'campaign_removed',
              source: 'campaign_management',
            },
          });
          dncAdded++;
        } catch {
          // skip duplicates
        }
      }

      await prisma.campaignContact.updateMany({
        where: { id: { in: contactIds }, campaignId },
        data: { status: 'SKIPPED' as any, outcome: 'dnc_added' },
      });

      return NextResponse.json({ dncAdded, contactsUpdated: contacts.length });
    }

    return NextResponse.json({ error: 'Invalid action. Use "remove" or "add_to_dnc"' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error managing contacts:', error);
    return NextResponse.json({ error: 'Failed to manage contacts' }, { status: 500 });
  }
}
