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

const availabilityQuerySchema = z.object({
  date: z.string(), // YYYY-MM-DD
  providerId: z.string().optional(),
  appointmentType: z.string().optional(),
  duration: z.number().optional(),
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
 * GET /api/pms/appointments/availability
 * 
 * Check available appointment slots
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
    const query = {
      date: searchParams.get('date') || new Date().toISOString().split('T')[0],
      providerId: searchParams.get('providerId') || undefined,
      appointmentType: searchParams.get('appointmentType') || undefined,
      duration: searchParams.get('duration') ? parseInt(searchParams.get('duration')!) : undefined,
    };
    
    // 3. Validate query
    const validation = availabilityQuerySchema.safeParse(query);
    
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
    
    // 5. Check availability
    const response = await pmsService.checkAvailability(validation.data);
    
    // 6. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'checkAvailability',
        endpoint: '/api/pms/appointments/availability',
        method: 'GET',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        requestSummary: JSON.stringify(query),
        responseStatus: response.success ? 200 : 400,
        responseTime: Date.now() - startTime,
        phiAccessed: false,
        success: response.success,
        errorMessage: response.error?.message,
      });
    }
    
    // 7. Return response
    return NextResponse.json(response, { 
      status: response.success ? 200 : 400 
    });
    
  } catch (error: any) {
    console.error('[PMS] Error in GET /appointments/availability:', error);
    
    // Log error
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'checkAvailability',
        endpoint: '/api/pms/appointments/availability',
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
