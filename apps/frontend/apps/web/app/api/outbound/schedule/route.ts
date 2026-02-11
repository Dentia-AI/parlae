import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';
import { z } from 'zod';

const scheduleCallSchema = z.object({
  voiceAgentId: z.string().uuid(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/), // E.164 format
  callType: z.enum(['OUTBOUND_LEAD', 'OUTBOUND_DEBT', 'OUTBOUND_FOLLOWUP', 'OUTBOUND_CAMPAIGN', 'OUTBOUND_OTHER']),
  scheduledAt: z.string().datetime(),
  callPurpose: z.string().optional(),
  campaignId: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  callNotes: z.string().optional(),
});

/**
 * POST /api/outbound/schedule
 * Schedules an outbound call
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    await requireSession();
    
    const body = await request.json();
    const validated = scheduleCallSchema.parse(body);

    // Create scheduled call
    const scheduledCall = await prisma.callLog.create({
      data: {
        voiceAgentId: validated.voiceAgentId,
        phoneNumber: validated.phoneNumber,
        callType: validated.callType,
        status: 'SCHEDULED',
        outcome: 'OTHER',
        direction: 'outbound', // For backward compatibility
        scheduledAt: new Date(validated.scheduledAt),
        callPurpose: validated.callPurpose,
        campaignId: validated.campaignId,
        contactName: validated.contactName,
        contactEmail: validated.contactEmail,
        callNotes: validated.callNotes,
        callStartedAt: new Date(validated.scheduledAt), // Will be updated when call actually starts
      },
    });

    return NextResponse.json({
      success: true,
      call: {
        id: scheduledCall.id,
        phoneNumber: scheduledCall.phoneNumber,
        scheduledAt: scheduledCall.scheduledAt,
        status: scheduledCall.status,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error scheduling outbound call:', error);
    return NextResponse.json(
      { error: 'Failed to schedule call' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/outbound/schedule
 * Returns scheduled outbound calls
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    await requireSession();
    
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : new Date();
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    const scheduledCalls = await prisma.callLog.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
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
      calls: scheduledCalls.map(call => ({
        id: call.id,
        phoneNumber: call.phoneNumber,
        callType: call.callType,
        scheduledAt: call.scheduledAt,
        callPurpose: call.callPurpose,
        campaignId: call.campaignId,
        contactName: call.contactName,
        callNotes: call.callNotes,
        agent: call.voiceAgent,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.error('Error fetching scheduled calls:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduled calls' },
      { status: 500 }
    );
  }
}
