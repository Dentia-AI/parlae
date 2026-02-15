import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';

/**
 * GET /api/call-logs/[id]
 * 
 * Returns full call log details including transcript and structured data.
 * 
 * HIPAA: Requires authentication. Only returns logs for the user's account.
 * Access is recorded in the call log's audit trail.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const userId = session.user?.id;
    const { id } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's personal account
    const account = await prisma.account.findFirst({
      where: { primaryOwnerId: userId, isPersonalAccount: true },
      select: { id: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Fetch call log - scoped to user's account for security
    const callLog = await prisma.callLog.findFirst({
      where: {
        id,
        accountId: account.id,
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

    if (!callLog) {
      return NextResponse.json({ error: 'Call log not found' }, { status: 404 });
    }

    // HIPAA: Record access in audit trail
    const existingLog = (callLog.accessLog as any) || { entries: [] };
    const updatedAccessLog = {
      entries: [
        ...existingLog.entries,
        {
          action: 'viewed',
          userId,
          timestamp: new Date().toISOString(),
          details: 'Call log details viewed (including transcript)',
        },
      ],
    };

    // Update access log asynchronously (don't block response)
    prisma.callLog.update({
      where: { id },
      data: { accessLog: updatedAccessLog },
    }).catch(() => {}); // Non-blocking

    // Parse structured data for response
    const structuredData = callLog.structuredData as any;

    return NextResponse.json({
      id: callLog.id,
      vapiCallId: callLog.vapiCallId,
      accountId: callLog.accountId,
      
      // Call details
      phoneNumber: callLog.phoneNumber,
      callType: callLog.callType,
      direction: callLog.direction,
      duration: callLog.duration,
      status: callLog.status,
      outcome: callLog.outcome,
      callReason: callLog.callReason,
      urgencyLevel: callLog.urgencyLevel,
      
      // Contact info
      contactName: callLog.contactName,
      contactEmail: callLog.contactEmail,
      
      // Content (HIPAA: PHI - authenticated access only)
      transcript: callLog.transcript,
      summary: callLog.summary,
      recordingUrl: callLog.recordingUrl,
      
      // Structured output from AI analysis
      structuredData: structuredData ? {
        patientName: structuredData.patientName,
        patientPhone: structuredData.patientPhone,
        patientEmail: structuredData.patientEmail,
        patientId: structuredData.patientId,
        isNewPatient: structuredData.isNewPatient,
        callReason: structuredData.callReason,
        callOutcome: structuredData.callOutcome,
        appointmentBooked: structuredData.appointmentBooked,
        appointmentCancelled: structuredData.appointmentCancelled,
        appointmentRescheduled: structuredData.appointmentRescheduled,
        appointmentType: structuredData.appointmentType,
        appointmentDate: structuredData.appointmentDate,
        appointmentTime: structuredData.appointmentTime,
        providerName: structuredData.providerName,
        insuranceVerified: structuredData.insuranceVerified,
        insuranceProvider: structuredData.insuranceProvider,
        paymentDiscussed: structuredData.paymentDiscussed,
        customerSentiment: structuredData.customerSentiment,
        urgencyLevel: structuredData.urgencyLevel,
        followUpRequired: structuredData.followUpRequired,
        followUpNotes: structuredData.followUpNotes,
        transferredToStaff: structuredData.transferredToStaff,
        transferredTo: structuredData.transferredTo,
        callSummary: structuredData.callSummary,
        keyTopicsDiscussed: structuredData.keyTopicsDiscussed,
        actionsPerformed: structuredData.actionsPerformed,
      } : null,
      
      // Flags
      appointmentSet: callLog.appointmentSet,
      leadCaptured: callLog.leadCaptured,
      insuranceVerified: callLog.insuranceVerified,
      insuranceProvider: callLog.insuranceProvider,
      paymentPlanDiscussed: callLog.paymentPlanDiscussed,
      paymentPlanAmount: callLog.paymentPlanAmount,
      transferredToStaff: callLog.transferredToStaff,
      transferredTo: callLog.transferredTo,
      followUpRequired: callLog.followUpRequired,
      followUpDate: callLog.followUpDate,
      
      // Quality
      customerSentiment: callLog.customerSentiment,
      aiConfidence: callLog.aiConfidence,
      callQuality: callLog.callQuality,
      
      // Cost
      costCents: callLog.costCents,
      
      // Metadata
      metadata: callLog.metadata,
      actions: callLog.actions,
      callNotes: callLog.callNotes,
      
      // Agent info
      voiceAgent: callLog.voiceAgent,
      
      // Timestamps
      callStartedAt: callLog.callStartedAt,
      callEndedAt: callLog.callEndedAt,
      createdAt: callLog.createdAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching call log detail:', error);
    return NextResponse.json({ error: 'Failed to fetch call log' }, { status: 500 });
  }
}
