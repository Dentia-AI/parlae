import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

/**
 * PATCH /api/action-items/:id
 *
 * Update an action item: change status, assign user, add staff notes.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: userId, isPersonalAccount: true },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const { id } = await params;

    const existing = await prisma.actionItem.findFirst({
      where: { id, accountId: account.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.status && ['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(body.status)) {
      updateData.status = body.status;
      if (body.status === 'RESOLVED') {
        updateData.resolvedAt = new Date();
        updateData.resolvedByUserId = userId;
      }
    }

    if (body.assignedToUserId !== undefined) {
      updateData.assignedToUserId =
        body.assignedToUserId === '__self__' ? userId : (body.assignedToUserId || null);
    }

    if (body.staffNotes !== undefined) {
      updateData.staffNotes = body.staffNotes;
    }

    const updated = await prisma.actionItem.update({
      where: { id },
      data: updateData,
    });

    if (body.status === 'RESOLVED' || body.status === 'IN_PROGRESS' || body.assignedToUserId) {
      const contactIdentifier = existing.contactName || existing.contactPhone || '';
      if (contactIdentifier) {
        await prisma.notification.updateMany({
          where: {
            accountId: account.id,
            dismissed: false,
            link: '/home/action-items',
            body: { contains: contactIdentifier },
          },
          data: { dismissed: true },
        });
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[action-items] PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update action item' },
      { status: 500 },
    );
  }
}
