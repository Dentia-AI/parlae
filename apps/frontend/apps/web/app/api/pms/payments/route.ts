import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  getPmsService, 
  logPmsAccess, 
  verifyVapiSignature, 
  getAccountIdFromVapiContext,
  redactPhi 
} from '../_lib/pms-utils';
import { prisma } from '@kit/prisma';

// ============================================================================
// Request Validation Schema
// ============================================================================

const createPaymentSchema = z.object({
  patientId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(['cash', 'check', 'credit_card', 'debit_card', 'ach', 'other']),
  last4: z.string().optional(),
  notes: z.string().optional(),
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
// API Route
// ============================================================================

/**
 * POST /api/pms/payments
 * 
 * Process a payment
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
    
    const { accountId, data, vapiCallId } = auth;
    
    // 2. Validate request body
    const validation = createPaymentSchema.safeParse(data.data || data);
    
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
    
    const paymentData = validation.data;
    
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
    
    // 4. Process payment
    const response = await pmsService.processPayment(paymentData);
    
    // 5. Log access
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'processPayment',
        endpoint: '/api/pms/payments',
        method: 'POST',
        vapiCallId,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        requestSummary: JSON.stringify(redactPhi(paymentData)),
        responseStatus: response.success ? 201 : 400,
        responseTime: Date.now() - startTime,
        phiAccessed: true,
        patientId: paymentData.patientId,
        success: response.success,
        errorMessage: response.error?.message,
      });
    }
    
    // 6. Return response
    return NextResponse.json(response, { 
      status: response.success ? 201 : 400 
    });
    
  } catch (error: any) {
    console.error('[PMS] Error in POST /payments:', error);
    
    if (pmsIntegrationId) {
      await logPmsAccess({
        pmsIntegrationId,
        action: 'processPayment',
        endpoint: '/api/pms/payments',
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
