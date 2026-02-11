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

const createInsuranceSchema = z.object({
  provider: z.string().min(1),
  policyNumber: z.string().min(1),
  groupNumber: z.string().optional(),
  subscriberName: z.string().optional(),
  subscriberDob: z.string().optional(),
  relationship: z.string().optional(),
  isPrimary: z.boolean(),
  effectiveDate: z.string().optional(),
  expirationDate: z.string().optional(),
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
 * GET /api/pms/patients/:id/insurance
 * 
 * Get patient insurance information
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
    
    // 3. Get patient insurance
    const response = await pmsService.getPatientInsurance(patientId);
    
    // 4. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'getPatientInsurance',
        endpoint: `/api/pms/patients/${patientId}/insurance`,
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
    console.error('[PMS] Error in GET /patients/:id/insurance:', error);
    
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'getPatientInsurance',
        endpoint: `/api/pms/patients/${params.id}/insurance`,
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
 * POST /api/pms/patients/:id/insurance
 * 
 * Add insurance to patient record
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
    const validation = createInsuranceSchema.safeParse(data.data || data);
    
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
    
    const insuranceData = validation.data;
    
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
    
    // 4. Add patient insurance
    const response = await pmsService.addPatientInsurance(patientId, {
      ...insuranceData,
      effectiveDate: insuranceData.effectiveDate ? new Date(insuranceData.effectiveDate) : undefined,
      expirationDate: insuranceData.expirationDate ? new Date(insuranceData.expirationDate) : undefined,
    });
    
    // 5. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'addPatientInsurance',
        endpoint: `/api/pms/patients/${patientId}/insurance`,
        method: 'POST',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        requestSummary: JSON.stringify(redactPhi(insuranceData)),
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
    console.error('[PMS] Error in POST /patients/:id/insurance:', error);
    
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'addPatientInsurance',
        endpoint: `/api/pms/patients/${params.id}/insurance`,
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
