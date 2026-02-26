import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { createVapiService } from '@kit/shared/vapi/vapi.service';
import { requireSession } from '~/lib/auth/get-session';
import { getAccountProvider } from '@kit/shared/voice-provider';
import type { RetellCallResponse } from '@kit/shared/retell/retell.service';

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

    const activeProvider = await getAccountProvider(account.id);

    if (activeProvider === 'RETELL') {
      try {
        const retellData = await fetchRetellRecentCalls(account.id, limit, offset);
        if (retellData.calls.length === 0 && process.env.NODE_ENV === 'development') {
          const mockCalls = generateMockRecentCalls(limit);
          return NextResponse.json({
            calls: mockCalls,
            pagination: { total: mockCalls.length, limit, offset: 0, hasMore: false },
          });
        }
        return NextResponse.json(retellData);
      } catch (retellErr) {
        console.warn('[recent-calls] Retell API call failed:', retellErr);
        if (process.env.NODE_ENV === 'development') {
          const mockCalls = generateMockRecentCalls(limit);
          return NextResponse.json({
            calls: mockCalls,
            pagination: { total: mockCalls.length, limit, offset: 0, hasMore: false },
          });
        }
        throw retellErr;
      }
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

async function fetchRetellRecentCalls(accountId: string, limit: number, offset: number) {
  const { createRetellService } = await import('@kit/shared/retell/retell.service');
  const retell = createRetellService();

  const fullAccount = await prisma.account.findUnique({
    where: { id: accountId },
    select: { phoneIntegrationSettings: true },
  });
  const settings = (fullAccount?.phoneIntegrationSettings as any) ?? {};

  const agentIds: string[] = [];
  if (settings.retellReceptionistAgentId) agentIds.push(settings.retellReceptionistAgentId);
  if (settings.retellAgentIds && Array.isArray(settings.retellAgentIds)) {
    agentIds.push(...settings.retellAgentIds);
  }

  if (agentIds.length === 0) {
    return { calls: [], pagination: { total: 0, limit, offset, hasMore: false } };
  }

  const allCalls: RetellCallResponse[] = [];
  for (const agentId of [...new Set(agentIds)]) {
    const calls = await retell.listCalls({
      filter_criteria: { agent_id: [agentId] },
      sort_order: 'descending',
      limit: limit + offset + 10,
    });
    allCalls.push(...(calls || []));
  }

  allCalls.sort((a, b) => (b.start_timestamp || 0) - (a.start_timestamp || 0));

  const total = allCalls.length;
  const paged = allCalls.slice(offset, offset + limit);

  const mappedCalls = paged.map((call) => {
    const analysis = (call.call_analysis ?? {}) as Record<string, any>;

    let duration: number | null = null;
    if (call.start_timestamp && call.end_timestamp) {
      duration = Math.round((call.end_timestamp - call.start_timestamp) / 1000);
    } else if (call.duration_ms) {
      duration = Math.round(call.duration_ms / 1000);
    }

    const outcome = (() => {
      const o = analysis?.call_outcome;
      if (o === 'appointment_booked' || analysis?.appointment_booked) return 'BOOKED';
      if (o === 'transferred_to_staff' || o === 'transferred_to_human' || analysis?.transferred_to_staff) return 'TRANSFERRED';
      if (o === 'insurance_verified' || o === 'insurance_updated') return 'INSURANCE_INQUIRY';
      if (o === 'general_inquiry' || o === 'information_provided') return 'INFORMATION';
      if (o === 'caller_hung_up') return 'HUNG_UP';
      if (o === 'emergency_handled') return 'EMERGENCY';
      if (o === 'appointment_rescheduled') return 'RESCHEDULED';
      if (o === 'appointment_cancelled') return 'CANCELLED';
      return 'OTHER';
    })();

    return {
      id: call.call_id,
      contactName: analysis.patient_name || null,
      phoneNumber: call.from_number || 'unknown',
      outcome,
      status: call.call_status === 'ended' ? 'COMPLETED' : (call.call_status || 'COMPLETED').toUpperCase(),
      callType: call.direction === 'outbound' ? 'OUTBOUND' : 'INBOUND',
      duration,
      callStartedAt: call.start_timestamp
        ? new Date(call.start_timestamp).toISOString()
        : new Date().toISOString(),
      appointmentSet: !!analysis.appointment_booked,
      insuranceVerified: !!analysis.insurance_verified,
      paymentPlanDiscussed: !!analysis.payment_discussed,
      paymentPlanAmount: null,
      transferredToStaff: !!analysis.transferred_to_staff,
      transferredTo: analysis.transferred_to || null,
      followUpRequired: !!analysis.follow_up_required,
      customerSentiment: analysis.customer_sentiment || null,
      callReason: analysis.call_reason || null,
      summary: analysis.call_summary || null,
      agent: null,
    };
  });

  return {
    calls: mappedCalls,
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  };
}
