import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  getPmsService, 
  logPmsAccess, 
  redactPhi 
} from '../_lib/pms-utils';
import { getContextFromVapiCall } from '../_lib/vapi-context';
import { prisma } from '@kit/prisma';

// ============================================================================
// Request Validation Schemas
// ============================================================================

const searchPatientSchema = z.object({
  query: z.string().min(1),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

const createPatientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().optional(),
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
  // Check Bearer Token (preferred method with credentialId)
  const authHeader = request.headers.get('Authorization');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const expectedToken = process.env.VAPI_WEBHOOK_SECRET;
    
    if (token === expectedToken) {
      // For Bearer token auth, parse body to get context
      const body = await request.text();
      const data = JSON.parse(body);
      
      // Get account/PMS from phone number in call
      const context = await getContextFromVapiCall(data);
      
      return { 
        authenticated: true, 
        context,
        data
      };
    }
    
    return { 
      authenticated: false, 
      error: 'Invalid Bearer token' 
    };
  }
  
  return { 
    authenticated: false, 
    error: 'Missing authentication (Bearer token required)' 
  };
}

// ============================================================================
// API Routes
// ============================================================================

/**
 * GET /api/pms/patients/search
 * 
 * Search for patients
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
    
    const { context } = auth;
    const { accountId, pmsIntegrationId: contextPmsIntegrationId, vapiCallId } = context;
    pmsIntegrationId = contextPmsIntegrationId;
    
    // 2. Parse query params
    const searchParams = request.nextUrl.searchParams;
    const searchQuery = {
      query: searchParams.get('query') || '',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
    };
    
    // 3. Validate query
    const validation = searchPatientSchema.safeParse(searchQuery);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 'INVALID_REQUEST', 
            message: 'Invalid query parameters',
            details: validation.error.errors 
          } 
        },
        { status: 400 }
      );
    }
    
    // 4. Get PMS service
    const pmsService = await getPmsService(accountId, pmsIntegrationId);
    
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
    
    // 5. Search patients
    const response = await pmsService.searchPatients(validation.data);
    
    // 6. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'searchPatients',
        endpoint: '/api/pms/patients/search',
        method: 'GET',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        requestSummary: JSON.stringify({ query: searchQuery.query }),
        responseStatus: response.success ? 200 : 400,
        responseTime: Date.now() - startTime,
        phiAccessed: true,
        success: response.success,
        errorMessage: response.error?.message,
      });
    }
    
    // 7. Return response
    return NextResponse.json(response, { 
      status: response.success ? 200 : 400 
    });
    
  } catch (error: any) {
    console.error('[PMS] Error in GET /patients/search:', error);
    
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'searchPatients',
        endpoint: '/api/pms/patients/search',
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
 * POST /api/pms/patients
 * 
 * Create a new patient
 */
export async function POST(request: NextRequest) {
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
    
    const { context, data } = auth;
    const { accountId, pmsIntegrationId: contextPmsIntegrationId, vapiCallId } = context;
    pmsIntegrationId = contextPmsIntegrationId;
    
    // 2. Validate request body
    const validation = createPatientSchema.safeParse(data.data || data);
    
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
    
    const patientData = validation.data;
    
    // 3. Get PMS service
    const pmsService = await getPmsService(accountId, pmsIntegrationId);
    
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
    
    // 4. Create patient
    const response = await pmsService.createPatient(patientData);
    
    // 5. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'createPatient',
        endpoint: '/api/pms/patients',
        method: 'POST',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        requestSummary: JSON.stringify(redactPhi(patientData)),
        responseStatus: response.success ? 201 : 400,
        responseTime: Date.now() - startTime,
        phiAccessed: true,
        patientId: response.data?.id,
        success: response.success,
        errorMessage: response.error?.message,
      });
    }
    
    // 6. Return response
    return NextResponse.json(response, { 
      status: response.success ? 201 : 400 
    });
    
  } catch (error: any) {
    console.error('[PMS] Error in POST /patients:', error);
    
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'createPatient',
        endpoint: '/api/pms/patients',
        method: 'POST',
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
