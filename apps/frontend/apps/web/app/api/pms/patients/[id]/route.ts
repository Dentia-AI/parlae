import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  getPmsService, 
  logPmsAccess, 
  verifyVapiSignature, 
  getAccountIdFromVapiContext,
  redactPhi 
} from '../../_lib/pms-utils';
import { prisma } from '@kit/prisma';

// ============================================================================
// Request Validation Schema
// ============================================================================

const updatePatientSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.object({
    street: z.string().optional(),
    street2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  emergencyContact: z.object({
    name: z.string(),
    phone: z.string(),
    relationship: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

async function authenticateRequest(request: NextRequest) {
  const signature = request.headers.get('x-vapi-signature');
  
  if (!signature) {
    return { 
      authenticated: false, 
      error: 'Missing Vapi signature' 
    };
  }
  
  const body = await request.text();
  const isValid = verifyVapiSignature(body, signature);
  
  if (!isValid) {
    return { 
      authenticated: false, 
      error: 'Invalid Vapi signature' 
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
 * GET /api/pms/patients/:id
 * 
 * Get patient information
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
    
    // 3. Get patient
    const response = await pmsService.getPatient(patientId);
    
    // 4. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'getPatient',
        endpoint: `/api/pms/patients/${patientId}`,
        method: 'GET',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        responseStatus: response.success ? 200 : 404,
        responseTime: Date.now() - startTime,
        phiAccessed: true,
        patientId,
        success: response.success,
        errorMessage: response.error?.message,
      });
    }
    
    // 5. Return response
    return NextResponse.json(response, { 
      status: response.success ? 200 : 404 
    });
    
  } catch (error: any) {
    console.error('[PMS] Error in GET /patients/:id:', error);
    
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'getPatient',
        endpoint: `/api/pms/patients/${params.id}`,
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
 * PATCH /api/pms/patients/:id
 * 
 * Update patient information
 */
export async function PATCH(
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
    const validation = updatePatientSchema.safeParse(data.data || data);
    
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
    
    // 4. Update patient
    const response = await pmsService.updatePatient(patientId, updates);
    
    // 5. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'updatePatient',
        endpoint: `/api/pms/patients/${patientId}`,
        method: 'PATCH',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        requestSummary: JSON.stringify(redactPhi(updates)),
        responseStatus: response.success ? 200 : 400,
        responseTime: Date.now() - startTime,
        phiAccessed: true,
        patientId,
        success: response.success,
        errorMessage: response.error?.message,
      });
    }
    
    // 6. Return response
    return NextResponse.json(response, { 
      status: response.success ? 200 : 400 
    });
    
  } catch (error: any) {
    console.error('[PMS] Error in PATCH /patients/:id:', error);
    
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'updatePatient',
        endpoint: `/api/pms/patients/${params.id}`,
        method: 'PATCH',
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
