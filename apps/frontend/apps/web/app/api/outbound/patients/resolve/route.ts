import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';
import { getPmsService } from '~/api/pms/_lib/pms-utils';

/**
 * POST /api/outbound/patients/resolve
 *
 * Resolves patient names from PMS by patientId.
 * Returns only display-safe data (first name initial + last name) — never stores it.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    if (!userId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { patientIds } = await request.json();

    if (!Array.isArray(patientIds) || patientIds.length === 0) {
      return NextResponse.json(
        { error: 'patientIds[] required' },
        { status: 400 },
      );
    }

    const cap = 100;
    const ids = patientIds.slice(0, cap);

    const accounts = await prisma.account.findMany({
      where: {
        members: { some: { userId } },
      },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const integration = await prisma.pmsIntegration.findFirst({
      where: { accountId: { in: accountIds }, status: 'ACTIVE' },
      select: { accountId: true },
    });

    if (!integration) {
      const fallback: Record<string, string> = {};
      for (const id of ids) fallback[id] = id;
      return NextResponse.json({ names: fallback, source: 'fallback' });
    }

    let pmsService;
    try {
      pmsService = await getPmsService(integration.accountId);
    } catch {
      // PMS credentials may be invalid
    }

    const names: Record<string, string> = {};

    if (pmsService) {
      const results = await Promise.allSettled(
        ids.map(async (id: string) => {
          const res = await pmsService!.getPatient(id);
          if (res.success && res.data) {
            const p = res.data;
            return {
              id,
              name: `${p.firstName.charAt(0)}. ${p.lastName}`,
            };
          }
          return { id, name: null };
        }),
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.name) {
          names[r.value.id] = r.value.name;
        }
      }
    }

    for (const id of ids) {
      if (!names[id]) names[id] = id;
    }

    return NextResponse.json({ names, source: pmsService ? 'pms' : 'fallback' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error resolving patient names:', error);
    return NextResponse.json(
      { error: 'Failed to resolve patient names' },
      { status: 500 },
    );
  }
}
