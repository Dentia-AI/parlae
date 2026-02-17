import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/vapi.service';
import { requireSession } from '~/lib/auth/get-session';

import type { VapiCall } from '@kit/shared/vapi/vapi.service';

/**
 * Generate mock recent calls data for development
 */
function generateMockRecentCalls(limit: number) {
  const names = ['Sarah Johnson', 'Michael Chen', 'Emma Wilson', 'James Davis', 'Lisa Anderson', 'Robert Martinez', 'Jennifer Taylor', 'David Brown'];
  const outcomes = ['BOOKED', 'TRANSFERRED', 'INSURANCE_INQUIRY', 'PAYMENT_PLAN', 'INFORMATION', 'OTHER'];
  const summaries = [
    'Patient called to schedule a new patient exam. Insurance verified with Delta Dental. Appointment booked for next Tuesday at 2pm.',
    'Existing patient inquired about treatment costs. Discussed payment plan options. Transferred to billing department.',
    'Patient called for insurance verification. Verified coverage with Aetna. Benefits include 2 cleanings per year.',
    'Follow-up call regarding outstanding balance. Set up payment plan for $500 over 5 months.',
    'General inquiry about office hours and services. Provided information about cosmetic dentistry options.',
    'Patient called to reschedule appointment. Moved from Thursday to Friday morning.',
    'New patient inquiry about pediatric services. Scheduled consultation for next week.',
    'Insurance verification for upcoming procedure. Confirmed pre-authorization with insurance provider.',
  ];

  return Array.from({ length: limit }, (_, i) => {
    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    const callStartedAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);

    return {
      id: `mock-${i}`,
      contactName: names[i % names.length],
      phoneNumber: `+1555${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`,
      outcome,
      status: 'COMPLETED',
      callType: 'INBOUND',
      duration: Math.floor(Math.random() * 240) + 30,
      callStartedAt: callStartedAt.toISOString(),
      appointmentSet: outcome === 'BOOKED',
      insuranceVerified: outcome === 'INSURANCE_INQUIRY' || Math.random() > 0.5,
      paymentPlanDiscussed: outcome === 'PAYMENT_PLAN',
      paymentPlanAmount: outcome === 'PAYMENT_PLAN' ? Math.floor(Math.random() * 100000) + 10000 : null,
      transferredToStaff: outcome === 'TRANSFERRED',
      transferredTo: outcome === 'TRANSFERRED' ? 'Front Desk' : null,
      followUpRequired: false,
      customerSentiment: null,
      callReason: null,
      summary: summaries[i % summaries.length],
      agent: {
        id: 'mock-agent-1',
        name: 'AI Receptionist',
        phoneNumber: '+15551234567',
      },
    };
  });
}

/**
 * GET /api/analytics/calls/recent
 * Returns recent call logs fetched from Vapi API.
 *
 * Query params:
 * - limit: number of calls to return (default: 10)
 * - offset: pagination offset (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    const account = userId ? await prisma.account.findFirst({
      where: { primaryOwnerId: userId, isPersonalAccount: true },
      select: { id: true },
    }) : null;

    if (!account) {
      if (process.env.NODE_ENV === 'development') {
        const mockCalls = generateMockRecentCalls(limit);
        return NextResponse.json({
          calls: mockCalls,
          pagination: { total: mockCalls.length, limit, offset: 0, hasMore: false },
        });
      }
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Get account's phone numbers from VapiPhoneNumber table
    let phoneNumbers = await prisma.vapiPhoneNumber.findMany({
      where: { accountId: account.id, isActive: true },
      select: { vapiPhoneId: true },
    });

    // Fallback: if no VapiPhoneNumber records, try phoneIntegrationSettings
    if (phoneNumbers.length === 0) {
      const fullAccount = await prisma.account.findUnique({
        where: { id: account.id },
        select: { phoneIntegrationSettings: true },
      });
      const settings = fullAccount?.phoneIntegrationSettings as any;
      if (settings?.vapiPhoneId) {
        phoneNumbers = [{ vapiPhoneId: settings.vapiPhoneId }];
      }
    }

    if (phoneNumbers.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        const mockCalls = generateMockRecentCalls(limit);
        return NextResponse.json({
          calls: mockCalls,
          pagination: { total: mockCalls.length, limit, offset: 0, hasMore: false },
        });
      }
      return NextResponse.json({
        calls: [],
        pagination: { total: 0, limit, offset, hasMore: false },
      });
    }

    // Fetch recent calls from Vapi
    const vapiService = createVapiService();
    const allCalls: VapiCall[] = [];

    for (const phone of phoneNumbers) {
      const calls = await vapiService.listCalls({
        phoneNumberId: phone.vapiPhoneId,
        limit: limit + offset + 10, // fetch extra for pagination
      });
      allCalls.push(...calls);
    }

    // Sort by most recent first
    allCalls.sort((a, b) => {
      const aTime = new Date(a.startedAt || a.endedAt || 0).getTime();
      const bTime = new Date(b.startedAt || b.endedAt || 0).getTime();
      return bTime - aTime;
    });

    // If no calls, return mock in dev
    if (allCalls.length === 0 && process.env.NODE_ENV === 'development') {
      const mockCalls = generateMockRecentCalls(limit);
      return NextResponse.json({
        calls: mockCalls,
        pagination: { total: mockCalls.length, limit, offset: 0, hasMore: false },
      });
    }

    const total = allCalls.length;
    const paginatedCalls = allCalls.slice(offset, offset + limit);

    const mappedCalls = paginatedCalls.map((call) => {
      const sd = call.analysis?.structuredData || {};
      const summary = call.analysis?.summary || call.summary || null;

      let duration: number | null = null;
      if (call.startedAt && call.endedAt) {
        duration = Math.round(
          (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
        );
      }

      return {
        id: call.id,
        contactName: sd.patientName || call.customer?.name || null,
        phoneNumber: call.customer?.number || call.phoneNumber?.number || 'unknown',
        outcome: inferOutcome(sd),
        status: call.status === 'ended' ? 'COMPLETED' : call.status?.toUpperCase() || 'COMPLETED',
        callType: call.type === 'outboundPhoneCall' ? 'OUTBOUND' : 'INBOUND',
        duration,
        callStartedAt: call.startedAt || call.endedAt || new Date().toISOString(),
        appointmentSet: !!sd.appointmentBooked,
        insuranceVerified: !!sd.insuranceVerified,
        paymentPlanDiscussed: !!sd.paymentDiscussed,
        paymentPlanAmount: null,
        transferredToStaff: !!sd.transferredToStaff,
        transferredTo: sd.transferredTo || null,
        followUpRequired: !!sd.followUpRequired,
        customerSentiment: sd.customerSentiment || null,
        callReason: sd.callReason || null,
        summary,
        agent: null,
      };
    });

    return NextResponse.json({
      calls: mappedCalls,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Error fetching recent calls:', error);
    return NextResponse.json({ error: 'Failed to fetch recent calls' }, { status: 500 });
  }
}

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
