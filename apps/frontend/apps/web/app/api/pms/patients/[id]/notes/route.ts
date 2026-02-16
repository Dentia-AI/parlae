import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  getPmsService, 
  logPmsAccess, 
  verifyVapiSignature, 
  getAccountIdFromVapiContext,
  redactPhi 
} from '../../../_lib/pms-utils';
import { prisma } from '@kit/prisma';

// ============================================================================
// Request Validation Schema
// ============================================================================

const createNoteSchema = z.object({
  content: z.string().min(1),
  category: z.string().optional(),
  createdBy: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

async function authenticateRequest(request: NextRequest) {
  const signature = request.headers.get('x-vapi-secret');
  
  if (!signature) {
    return { 
      authenticated: false, 
      error: 'Missing Vapi secret' 
    };
  }
  
  const body = await request.text();
  const isValid = verifyVapiSignature(body, signature);
  
  if (!isValid) {
    return { 
      authenticated: false, 
      error: 'Invalid Vapi secret' 
    };
  }
  
  const data = JSON.parse(body);
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
 * GET /api/pms/patients/:id/notes
 * 
 * Get patient notes
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();
  let pmsIntegrationId: string | undefined;
  
  try {
    const patientId = params.id;
    
    // 1. Authenticate request
    const auth = await authenticateRequest(request);
    
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: auth.error } },
        { status: 401 }
      );
    }
    
    const { accountId, vapiCallId } = auth;
    
    // 2. Get PMS service
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
    
    // 3. Get patient notes
    const response = await pmsService.getPatientNotes(patientId);
    
    // 4. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'getPatientNotes',
        endpoint: `/api/pms/patients/${patientId}/notes`,
        method: 'GET',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        responseStatus: response.success ? 200 : 400,
        responseTime: Date.now() - startTime,
        phiAccessed: true,
        patientId,
        success: response.success,
        errorMessage: response.error?.message,
      });
    }
    
    // 5. Return response
    return NextResponse.json(response, { 
      status: response.success ? 200 : 400 
    });
    
  } catch (error: any) {
    console.error('[PMS] Error in GET /patients/:id/notes:', error);
    
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'getPatientNotes',
        endpoint: `/api/pms/patients/${params.id}/notes`,
        method: 'GET',
        responseTime: Date.now() - startTime,
        phiAccessed: false,
        patientId: params.id,
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
 * POST /api/pms/patients/:id/notes
 * 
 * Add a note to patient record
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();
  let pmsIntegrationId: string | undefined;
  
  try {
    const patientId = params.id;
    
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
    const validation = createNoteSchema.safeParse(data.data || data);
    
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
    
    const noteData = validation.data;
    
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
    
    // 4. Add patient note
    const response = await pmsService.addPatientNote(patientId, noteData);
    
    // 5. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'addPatientNote',
        endpoint: `/api/pms/patients/${patientId}/notes`,
        method: 'POST',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        requestSummary: JSON.stringify({ category: noteData.category }),
        responseStatus: response.success ? 201 : 400,
        responseTime: Date.now() - startTime,
        phiAccessed: true,
        patientId,
        success: response.success,
        errorMessage: response.error?.message,
      });
    }
    
    // 6. Return response
    return NextResponse.json(response, { 
      status: response.success ? 201 : 400 
    });
    
  } catch (error: any) {
    console.error('[PMS] Error in POST /patients/:id/notes:', error);
    
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'addPatientNote',
        endpoint: `/api/pms/patients/${params.id}/notes`,
        method: 'POST',
        responseTime: Date.now() - startTime,
        phiAccessed: false,
        patientId: params.id,
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
