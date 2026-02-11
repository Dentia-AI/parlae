import { prisma } from '@kit/prisma';
import { createPmsService } from '@kit/shared/pms';
import type { IPmsService, PmsConfig, PmsCredentials, PmsProvider } from '@kit/shared/pms';
import crypto from 'crypto';

/**
 * Decrypt sensitive data retrieved from database
 */
function decrypt(encryptedData: string): any {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  
  const { encrypted, iv, authTag } = JSON.parse(encryptedData);
  
  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

/**
 * Get PMS service instance for an account
 * 
 * @param accountId Account ID
 * @param provider Optional specific provider (defaults to first active integration)
 * @returns PMS service instance
 */
export async function getPmsService(
  accountId: string,
  provider?: PmsProvider
): Promise<IPmsService | null> {
  // Find PMS integration
  const integration = await prisma.pmsIntegration.findFirst({
    where: {
      accountId,
      ...(provider ? { provider: provider as any } : {}),
      status: 'ACTIVE',
    },
  });
  
  if (!integration) {
    return null;
  }
  
  // Decrypt credentials
  const credentials = decrypt(integration.credentials as any) as PmsCredentials;
  
  // Create service
  const service = createPmsService(
    integration.provider as PmsProvider,
    accountId,
    credentials,
    (integration.config as PmsConfig) || {}
  );
  
  return service;
}

/**
 * Log PMS API call for HIPAA audit trail
 */
export async function logPmsAccess(params: {
  pmsIntegrationId: string;
  action: string;
  endpoint: string;
  method: string;
  userId?: string;
  vapiCallId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestSummary?: string;
  responseStatus?: number;
  responseTime?: number;
  phiAccessed: boolean;
  patientId?: string;
  success: boolean;
  errorMessage?: string;
}): Promise<void> {
  try {
    await prisma.pmsAuditLog.create({
      data: {
        pmsIntegrationId: params.pmsIntegrationId,
        action: params.action,
        endpoint: params.endpoint,
        method: params.method,
        userId: params.userId,
        vapiCallId: params.vapiCallId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        requestSummary: params.requestSummary,
        responseStatus: params.responseStatus,
        responseTime: params.responseTime,
        phiAccessed: params.phiAccessed,
        patientId: params.patientId,
        success: params.success,
        errorMessage: params.errorMessage,
      },
    });
  } catch (error) {
    console.error('[PMS Audit] Failed to log access:', error);
    // Don't throw - audit logging failure shouldn't break the main operation
  }
}

/**
 * Verify Vapi webhook signature
 */
export function verifyVapiSignature(payload: string, signature: string): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  
  if (!secret) {
    console.warn('[PMS] VAPI_WEBHOOK_SECRET not set - skipping signature verification');
    return true; // Allow in development
  }
  
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('[PMS] Signature verification failed:', error);
    return false;
  }
}

/**
 * Extract account ID from Vapi webhook context
 */
export function getAccountIdFromVapiContext(context: any): string | null {
  // Vapi passes custom data in the call.metadata field
  return context?.call?.metadata?.accountId || null;
}

/**
 * Redact PHI from data for logging
 */
export function redactPhi(data: any): any {
  if (!data) return data;
  
  const redacted = { ...data };
  const phiFields = [
    'ssn',
    'socialSecurityNumber',
    'dateOfBirth',
    'dob',
    'address',
    'phone',
    'phoneNumber',
    'email',
    'policyNumber',
    'groupNumber',
    'last4',
  ];
  
  phiFields.forEach(field => {
    if (redacted[field]) {
      redacted[field] = '[REDACTED]';
    }
  });
  
  return redacted;
}
