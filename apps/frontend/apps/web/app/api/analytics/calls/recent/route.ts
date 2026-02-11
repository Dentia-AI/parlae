import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

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
      duration: Math.floor(Math.random() * 240) + 30, // 30-270 seconds
      callStartedAt: callStartedAt.toISOString(),
      appointmentSet: outcome === 'BOOKED',
      insuranceVerified: outcome === 'INSURANCE_INQUIRY' || Math.random() > 0.5,
      paymentPlanDiscussed: outcome === 'PAYMENT_PLAN',
      paymentPlanAmount: outcome === 'PAYMENT_PLAN' ? Math.floor(Math.random() * 100000) + 10000 : null,
      transferredToStaff: outcome === 'TRANSFERRED',
      transferredTo: outcome === 'TRANSFERRED' ? 'Front Desk' : null,
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
 * Returns recent call logs with full details
 * Query params:
 * - limit: number of calls to return (default: 10)
 * - offset: pagination offset (default: 0)
 * - agentId: voice agent ID (optional)
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    await requireSession();
    
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    const agentId = searchParams.get('agentId');

    const where: any = {};
    if (agentId) {
      where.voiceAgentId = agentId;
    }

    const total = await prisma.callLog.count({ where });

    // If no calls and in development, return mock data
    if (total === 0 && process.env.NODE_ENV === 'development') {
      const mockCalls = generateMockRecentCalls(limit);
      return NextResponse.json({
        calls: mockCalls,
        pagination: {
          total: mockCalls.length,
          limit,
          offset: 0,
          hasMore: false,
        },
      });
    }

    const calls = await prisma.callLog.findMany({
      where,
      orderBy: {
        callStartedAt: 'desc',
      },
      take: limit,
      skip: offset,
      include: {
        voiceAgent: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
        },
      },
    });

    return NextResponse.json({
      calls: calls.map(call => ({
        id: call.id,
        contactName: call.contactName,
        phoneNumber: call.phoneNumber,
        outcome: call.outcome,
        status: call.status,
        callType: call.callType,
        duration: call.duration,
        callStartedAt: call.callStartedAt,
        appointmentSet: call.appointmentSet,
        insuranceVerified: call.insuranceVerified,
        paymentPlanDiscussed: call.paymentPlanDiscussed,
        paymentPlanAmount: call.paymentPlanAmount,
        transferredToStaff: call.transferredToStaff,
        transferredTo: call.transferredTo,
        summary: call.summary,
        agent: call.voiceAgent,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.error('Error fetching recent calls:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent calls' },
      { status: 500 }
    );
  }
}
