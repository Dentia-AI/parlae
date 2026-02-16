import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  getPmsService, 
  logPmsAccess, 
  verifyVapiSignature, 
  getAccountIdFromVapiContext,
  redactPhi 
} from '../_lib/pms-utils';
import {
  bookGoogleCalendarAppointment,
  sendBookingConfirmation,
  extractPatientFromVapiData,
  extractAppointmentFromVapiData,
} from '../_lib/google-calendar-utils';
import { prisma } from '@kit/prisma';

// ============================================================================
// Request Validation Schemas
// ============================================================================

const listAppointmentsSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  patientId: z.string().optional(),
  providerId: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

// Patient information schema
const patientInfoSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  email: z.string().optional(),
  dateOfBirth: z.string().optional(),
  patientId: z.string().optional(),
});

// Enhanced booking schema with patient info
const bookAppointmentSchema = z.object({
  // Patient information (required for Google Calendar fallback)
  patient: patientInfoSchema.optional(),
  
  // Appointment details
  patientId: z.string().optional(), // Required for PMS, optional for Google Calendar
  providerId: z.string().optional(),
  appointmentType: z.string(),
  startTime: z.string(), // ISO 8601
  duration: z.number(),
  notes: z.string().optional(),
  sendConfirmation: z.boolean().optional().default(true),
  metadata: z.record(z.any()).optional(),
});

const rescheduleAppointmentSchema = z.object({
  startTime: z.string().optional(), // ISO 8601
  duration: z.number().optional(),
  providerId: z.string().optional(),
  appointmentType: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
  sendNotification: z.boolean().optional(),
});

const cancelAppointmentSchema = z.object({
  reason: z.string().optional(),
  sendNotification: z.boolean().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

async function authenticateRequest(request: NextRequest) {
  // Get Vapi secret from header
  const signature = request.headers.get('x-vapi-secret');
  
  if (!signature) {
    return { 
      authenticated: false, 
      error: 'Missing Vapi secret' 
    };
  }
  
  // Get request body
  const body = await request.text();
  
  // Verify secret
  const isValid = verifyVapiSignature(body, signature);
  
  if (!isValid) {
    return { 
      authenticated: false, 
      error: 'Invalid Vapi secret' 
    };
  }
  
  // Parse body
  const data = JSON.parse(body);
  
  // Extract account ID from call context
  const accountId = getAccountIdFromVapiContext(data);
  
  if (!accountId) {
    return { 
      authenticated: false, 
      error: 'No account ID in call context' 
    };
  }
  
  return { 
    authenticated: true, 
    accountId, 
    data, 
    vapiCallId: data.call?.id 
  };
}

// ============================================================================
// API Routes
// ============================================================================

/**
 * GET /api/pms/appointments
 * 
 * List appointments with optional filters
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let pmsIntegrationId: string | undefined;
  
  try {
    // 1. Authenticate request
    const auth = await authenticateRequest(request);
    
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: auth.error } },
        { status: 401 }
      );
    }
    
    const { accountId, vapiCallId } = auth;
    
    // 2. Parse query params
    const searchParams = request.nextUrl.searchParams;
    const filters = {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      patientId: searchParams.get('patientId') || undefined,
      providerId: searchParams.get('providerId') || undefined,
      status: searchParams.get('status') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    };
    
    // 3. Get PMS service
    const pmsService = await getPmsService(accountId!);
    
    if (!pmsService) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_PMS_INTEGRATION', message: 'No PMS integration found' } },
        { status: 404 }
      );
    }
    
    // Get integration ID for audit logging
    const integration = await prisma.pmsIntegration.findFirst({
      where: { accountId: accountId!, status: 'ACTIVE' },
    });
    pmsIntegrationId = integration?.id;
    
    // 4. Call PMS API
    const response = await pmsService.getAppointments({
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      patientId: filters.patientId,
      providerId: filters.providerId,
      status: filters.status,
      limit: filters.limit,
      offset: filters.offset,
    });
    
    // 5. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'getAppointments',
        endpoint: '/api/pms/appointments',
        method: 'GET',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        requestSummary: JSON.stringify(redactPhi(filters)),
        responseStatus: response.success ? 200 : 400,
        responseTime: Date.now() - startTime,
        phiAccessed: true,
        success: response.success,
        errorMessage: response.error?.message,
      });
    }
    
    // 6. Return response
    return NextResponse.json(response, { 
      status: response.success ? 200 : 400 
    });
    
  } catch (error: any) {
    console.error('[PMS] Error in GET /appointments:', error);
    
    // Log error
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'getAppointments',
        endpoint: '/api/pms/appointments',
        method: 'GET',
        responseTime: Date.now() - startTime,
        phiAccessed: false,
        success: false,
        errorMessage: error.message,
      });
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'An unexpected error occurred' 
        } 
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pms/appointments
 * 
 * Book a new appointment
 * Supports both PMS integration and Google Calendar fallback
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let pmsIntegrationId: string | undefined;
  let integrationType: 'pms' | 'google_calendar' = 'pms';
  
  try {
    // 1. Authenticate request
    const auth = await authenticateRequest(request);
    
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: auth.error } },
        { status: 401 }
      );
    }
    
    const { accountId, data, vapiCallId } = auth;
    
    // 2. Validate request body
    const validation = bookAppointmentSchema.safeParse(data.data || data);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'INVALID_REQUEST', 
            message: 'Invalid request data',
            details: validation.error.errors 
          } 
        },
        { status: 400 }
      );
    }
    
    const appointmentData = validation.data;
    
    // 3. Try to get PMS service first
    const pmsService = await getPmsService(accountId!);
    
    // 4a. If PMS is available, use it
    if (pmsService && appointmentData.patientId) {
      integrationType = 'pms';
      
      // Get integration ID for audit logging
      const integration = await prisma.pmsIntegration.findFirst({
        where: { accountId: accountId!, status: 'ACTIVE' },
      });
      pmsIntegrationId = integration?.id;
      
      // Book via PMS
      const response = await pmsService.bookAppointment({
        patientId: appointmentData.patientId,
        providerId: appointmentData.providerId,
        appointmentType: appointmentData.appointmentType,
        startTime: new Date(appointmentData.startTime),
        duration: appointmentData.duration,
        notes: appointmentData.notes,
        sendConfirmation: appointmentData.sendConfirmation,
        metadata: appointmentData.metadata,
      });
      
      // Log PMS access
      if (pmsIntegrationId) {
        await logPmsAccess({
          pmsIntegrationId,
          action: 'bookAppointment',
          endpoint: '/api/pms/appointments',
          method: 'POST',
          vapiCallId,
          ipAddress: request.headers.get('x-forwarded-for') || undefined,
          userAgent: request.headers.get('user-agent') || undefined,
          requestSummary: JSON.stringify(redactPhi(appointmentData)),
          responseStatus: response.success ? 201 : 400,
          responseTime: Date.now() - startTime,
          phiAccessed: true,
          patientId: appointmentData.patientId,
          success: response.success,
          errorMessage: response.error?.message,
        });
      }
      
      // Send confirmation if requested and booking succeeded
      if (response.success && appointmentData.sendConfirmation && appointmentData.patient) {
        await sendBookingConfirmation(
          accountId!,
          appointmentData.patient,
          {
            appointmentType: appointmentData.appointmentType,
            startTime: new Date(appointmentData.startTime),
            duration: appointmentData.duration,
            notes: appointmentData.notes,
          },
          'pms',
        );
      }
      
      return NextResponse.json(response, { 
        status: response.success ? 201 : 400 
      });
    }
    
    // 4b. If no PMS, try Google Calendar fallback
    else {
      integrationType = 'google_calendar';
      
      // Check if Google Calendar is connected
      const account = await prisma.account.findUnique({
        where: { id: accountId! },
        select: { googleCalendarConnected: true },
      });
      
      if (!account?.googleCalendarConnected) {
        return NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 'NO_INTEGRATION', 
              message: 'No PMS or Google Calendar integration found. Please connect one first.' 
            } 
          },
          { status: 404 }
        );
      }
      
      // Extract patient info from request
      let patient = appointmentData.patient;
      if (!patient) {
        patient = extractPatientFromVapiData(data);
      }
      
      if (!patient) {
        return NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 'MISSING_PATIENT_INFO', 
              message: 'Patient information is required for Google Calendar booking' 
            } 
          },
          { status: 400 }
        );
      }
      
      // Book via Google Calendar
      const response = await bookGoogleCalendarAppointment(
        accountId!,
        patient,
        {
          appointmentType: appointmentData.appointmentType,
          startTime: new Date(appointmentData.startTime),
          duration: appointmentData.duration,
          notes: appointmentData.notes,
          providerId: appointmentData.providerId,
        },
        vapiCallId,
      );
      
      // Send confirmation if requested and booking succeeded
      if (response.success && appointmentData.sendConfirmation) {
        await sendBookingConfirmation(
          accountId!,
          patient,
          {
            appointmentType: appointmentData.appointmentType,
            startTime: new Date(appointmentData.startTime),
            duration: appointmentData.duration,
            notes: appointmentData.notes,
          },
          'google_calendar',
          response.htmlLink,
        );
      }
      
      return NextResponse.json(response, { 
        status: response.success ? 201 : 400 
      });
    }
    
  } catch (error: any) {
    console.error('[PMS/Calendar] Error in POST /appointments:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'An unexpected error occurred' 
        } 
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/pms/appointments/:id
 * 
 * Reschedule an appointment
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();
  let pmsIntegrationId: string | undefined;
  
  try {
    const appointmentId = params.id;
    
    // 1. Authenticate request
    const auth = await authenticateRequest(request);
    
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: auth.error } },
        { status: 401 }
      );
    }
    
    const { accountId, data, vapiCallId } = auth;
    
    // 2. Validate request body
    const validation = rescheduleAppointmentSchema.safeParse(data.data || data);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'INVALID_REQUEST', 
            message: 'Invalid request data',
            details: validation.error.errors 
          } 
        },
        { status: 400 }
      );
    }
    
    const updates = validation.data;
    
    // 3. Get PMS service
    const pmsService = await getPmsService(accountId!);
    
    if (!pmsService) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_PMS_INTEGRATION', message: 'No PMS integration found' } },
        { status: 404 }
      );
    }
    
    // Get integration ID for audit logging
    const integration = await prisma.pmsIntegration.findFirst({
      where: { accountId: accountId!, status: 'ACTIVE' },
    });
    pmsIntegrationId = integration?.id;
    
    // 4. Reschedule appointment
    const response = await pmsService.rescheduleAppointment(appointmentId, {
      startTime: updates.startTime ? new Date(updates.startTime) : undefined,
      duration: updates.duration,
      providerId: updates.providerId,
      appointmentType: updates.appointmentType,
      notes: updates.notes,
      status: updates.status as any,
      sendNotification: updates.sendNotification,
    });
    
    // 5. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'rescheduleAppointment',
        endpoint: `/api/pms/appointments/${appointmentId}`,
        method: 'PATCH',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        requestSummary: JSON.stringify(redactPhi(updates)),
        responseStatus: response.success ? 200 : 400,
        responseTime: Date.now() - startTime,
        phiAccessed: true,
        success: response.success,
        errorMessage: response.error?.message,
      });
    }
    
    // 6. Return response
    return NextResponse.json(response, { 
      status: response.success ? 200 : 400 
    });
    
  } catch (error: any) {
    console.error('[PMS] Error in PATCH /appointments/:id:', error);
    
    // Log error
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'rescheduleAppointment',
        endpoint: `/api/pms/appointments/${params.id}`,
        method: 'PATCH',
        responseTime: Date.now() - startTime,
        phiAccessed: false,
        success: false,
        errorMessage: error.message,
      });
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'An unexpected error occurred' 
        } 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pms/appointments/:id
 * 
 * Cancel an appointment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();
  let pmsIntegrationId: string | undefined;
  
  try {
    const appointmentId = params.id;
    
    // 1. Authenticate request
    const auth = await authenticateRequest(request);
    
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: auth.error } },
        { status: 401 }
      );
    }
    
    const { accountId, data, vapiCallId } = auth;
    
    // 2. Validate request body
    const validation = cancelAppointmentSchema.safeParse(data.data || data);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'INVALID_REQUEST', 
            message: 'Invalid request data',
            details: validation.error.errors 
          } 
        },
        { status: 400 }
      );
    }
    
    const cancelData = validation.data;
    
    // 3. Get PMS service
    const pmsService = await getPmsService(accountId!);
    
    if (!pmsService) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_PMS_INTEGRATION', message: 'No PMS integration found' } },
        { status: 404 }
      );
    }
    
    // Get integration ID for audit logging
    const integration = await prisma.pmsIntegration.findFirst({
      where: { accountId: accountId!, status: 'ACTIVE' },
    });
    pmsIntegrationId = integration?.id;
    
    // 4. Cancel appointment
    const response = await pmsService.cancelAppointment(appointmentId, cancelData);
    
    // 5. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'cancelAppointment',
        endpoint: `/api/pms/appointments/${appointmentId}`,
        method: 'DELETE',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        requestSummary: JSON.stringify(redactPhi(cancelData)),
        responseStatus: response.success ? 200 : 400,
        responseTime: Date.now() - startTime,
        phiAccessed: true,
        success: response.success,
        errorMessage: response.error?.message,
      });
    }
    
    // 6. Return response
    return NextResponse.json(response, { 
      status: response.success ? 200 : 400 
    });
    
  } catch (error: any) {
    console.error('[PMS] Error in DELETE /appointments/:id:', error);
    
    // Log error
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'cancelAppointment',
        endpoint: `/api/pms/appointments/${params.id}`,
        method: 'DELETE',
        responseTime: Date.now() - startTime,
        phiAccessed: false,
        success: false,
        errorMessage: error.message,
      });
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'An unexpected error occurred' 
        } 
      },
      { status: 500 }
    );
  }
}
