import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@kit/prisma';
import { auth } from '@kit/shared/auth';

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
});

function mapAccount(account: { id: string; name: string | null; pictureUrl: string | null; publicData: unknown }) {
  return {
    id: account.id,
    name: account.name,
    picture_url: account.pictureUrl,
    public_data: account.publicData ?? null,
  };
}

export async function GET() {
  const session = await auth();

  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const account = await prisma.account.findFirst({
    where: {
      primaryOwnerId: userId,
      isPersonalAccount: true,
    },
    select: {
      id: true,
      name: true,
      pictureUrl: true,
      publicData: true,
    },
  });

  if (!account) {
    return NextResponse.json({ error: 'Personal account not found' }, { status: 404 });
  }

  return NextResponse.json(mapAccount(account));
}

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const account = await prisma.account.findFirst({
    where: {
      primaryOwnerId: userId,
      isPersonalAccount: true,
    },
    select: {
      id: true,
    },
  });

  if (!account) {
    return NextResponse.json({ error: 'Personal account not found' }, { status: 404 });
  }

  const updated = await prisma.account.update({
    where: {
      id: account.id,
    },
    data: {
      name: parsed.data.name ?? undefined,
    },
    select: {
      id: true,
      name: true,
      pictureUrl: true,
      publicData: true,
    },
  });

  return NextResponse.json(mapAccount(updated));
}
