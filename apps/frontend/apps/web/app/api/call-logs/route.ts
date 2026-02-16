import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/vapi.service';
import { requireSession } from '~/lib/auth/get-session';

import type { VapiCall } from '@kit/shared/vapi/vapi.service';

/**
 * Map a Vapi call to the shape the frontend expects for the call list.
 */
function mapVapiCallToListItem(call: VapiCall) {
  const analysis = call.analysis || {};
  const structuredData = analysis.structuredData || {};
  const artifact = call.artifact || {};
  const summary = analysis.summary || call.summary || null;
  const transcript = artifact.transcript || call.transcript || null;

  // Calculate duration in seconds
  let duration: number | null = null;
  if (call.startedAt && call.endedAt) {
    duration = Math.round(
      (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
    );
  }

  // Infer outcome from structured data
  const outcome = inferOutcome(structuredData);

  return {
    id: call.id,
    vapiCallId: call.id,
    phoneNumber: call.customer?.number || call.phoneNumber?.number || 'unknown',
    callType: call.type === 'outboundPhoneCall' ? 'OUTBOUND' : 'INBOUND',
    duration,
    status: call.status === 'ended' ? 'COMPLETED' : call.status?.toUpperCase() || 'COMPLETED',
    outcome,
    callReason: structuredData.callReason || null,
    urgencyLevel: structuredData.urgencyLevel || null,
    contactName: structuredData.patientName || call.customer?.name || null,
    contactEmail: structuredData.patientEmail || null,
    summary,
    appointmentSet: !!structuredData.appointmentBooked,
    insuranceVerified: !!structuredData.insuranceVerified,
    paymentPlanDiscussed: !!structuredData.paymentDiscussed,
    transferredToStaff: !!structuredData.transferredToStaff,
    transferredTo: structuredData.transferredTo || null,
    followUpRequired: !!structuredData.followUpRequired,
    customerSentiment: structuredData.customerSentiment || null,
    costCents: call.cost ? Math.round(call.cost * 100) : null,
    callStartedAt: call.startedAt || call.endedAt || new Date().toISOString(),
    callEndedAt: call.endedAt || null,
  };
}

/**
 * Infer a call outcome string from Vapi structured data.
 */
function inferOutcome(structuredData: Record<string, any>): string {
  const outcome = structuredData?.callOutcome;
  switch (outcome) {
    case 'appointment_booked': return 'BOOKED';
    case 'transferred_to_staff': return 'TRANSFERRED';
    case 'insurance_verified': return 'INSURANCE_INQUIRY';
    case 'payment_plan_discussed': return 'PAYMENT_PLAN';
    case 'information_provided': return 'INFORMATION';
    case 'voicemail': return 'VOICEMAIL';
    default: {
      if (structuredData?.appointmentBooked) return 'BOOKED';
      if (structuredData?.transferredToStaff) return 'TRANSFERRED';
      if (structuredData?.insuranceVerified) return 'INSURANCE_INQUIRY';
      if (structuredData?.paymentDiscussed) return 'PAYMENT_PLAN';
      return 'OTHER';
    }
  }
}

/**
 * GET /api/call-logs
 *
 * Returns paginated call logs for the current user's account.
 * Data is fetched from Vapi API (source of truth) and scoped to the account's phone numbers.
 *
 * Query params:
 * - page: page number (default: 1)
 * - limit: items per page (default: 20, max: 100)
 * - startDate: ISO date string (filter from)
 * - endDate: ISO date string (filter to)
 * - outcome: filter by outcome (client-side filtering after Vapi fetch)
 * - search: search by contact name or phone number (client-side filtering)
 */
export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const outcome = searchParams.get('outcome');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');

    // Get account's phone numbers from VapiPhoneNumber
    const phoneNumbers = await prisma.vapiPhoneNumber.findMany({
      where: { accountId: account.id, isActive: true },
      select: { vapiPhoneId: true },
    });

    if (phoneNumbers.length === 0) {
      return NextResponse.json({
        calls: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
        filters: { outcomes: [], reasons: [] },
      });
    }

    // Fetch calls from Vapi for each phone number
    const vapiService = createVapiService();
    const allCalls: VapiCall[] = [];

    for (const phone of phoneNumbers) {
      const calls = await vapiService.listCalls({
        phoneNumberId: phone.vapiPhoneId,
        limit: 1000,
        createdAtGe: startDate || undefined,
        createdAtLe: endDate || undefined,
      });
      allCalls.push(...calls);
    }

    // Sort by start time descending
    allCalls.sort((a, b) => {
      const aTime = new Date(a.startedAt || a.endedAt || 0).getTime();
      const bTime = new Date(b.startedAt || b.endedAt || 0).getTime();
      return bTime - aTime;
    });

    // Map to frontend shape
    let mappedCalls = allCalls.map(mapVapiCallToListItem);

    // Apply client-side filters
    if (outcome) {
      mappedCalls = mappedCalls.filter(c => c.outcome === outcome);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      mappedCalls = mappedCalls.filter(c =>
        (c.contactName && c.contactName.toLowerCase().includes(searchLower)) ||
        (c.phoneNumber && c.phoneNumber.includes(search)) ||
        (c.contactEmail && c.contactEmail.toLowerCase().includes(searchLower)) ||
        (c.callReason && c.callReason.toLowerCase().includes(searchLower))
      );
    }

    const total = mappedCalls.length;
    const offset = (page - 1) * limit;
    const paginatedCalls = mappedCalls.slice(offset, offset + limit);

    // Compute aggregate stats
    const outcomeCounts = new Map<string, number>();
    const reasonCounts = new Map<string, number>();
    for (const c of mappedCalls) {
      outcomeCounts.set(c.outcome, (outcomeCounts.get(c.outcome) || 0) + 1);
      if (c.callReason) {
        reasonCounts.set(c.callReason, (reasonCounts.get(c.callReason) || 0) + 1);
      }
    }

    return NextResponse.json({
      calls: paginatedCalls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
      filters: {
        outcomes: Array.from(outcomeCounts.entries()).map(([value, count]) => ({ value, count })),
        reasons: Array.from(reasonCounts.entries()).map(([value, count]) => ({ value, count })),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching call logs:', error);
    return NextResponse.json({ error: 'Failed to fetch call logs' }, { status: 500 });
  }
}
