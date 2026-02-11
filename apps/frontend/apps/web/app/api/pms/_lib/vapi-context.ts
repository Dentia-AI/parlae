/**
 * Vapi Call Context Utilities
 * Extract account and PMS information from Vapi webhook calls
 */

import { prisma } from '@kit/prisma';

export interface VapiCallContext {
  accountId: string;
  pmsIntegrationId: string;
  phoneNumber: string;
  vapiPhoneId?: string;
  vapiCallId?: string;
  customerPhone?: string;
  customerName?: string;
}

/**
 * Extract context from Vapi webhook payload
 * 
 * Vapi sends comprehensive metadata including:
 * - call.id - Unique call identifier
 * - call.phoneNumberId - Vapi's phone number ID
 * - call.phoneNumber - The number that was called (E.164)
 * - call.customer.number - Caller's phone number
 * - call.customer.name - Caller's name (if available)
 * - assistant.id - Assistant handling the call
 * - squad.id - Squad ID if using multi-agent
 */
export async function getContextFromVapiCall(vapiPayload: any): Promise<VapiCallContext> {
  const call = vapiPayload.call;
  const customer = call?.customer;
  
  if (!call) {
    throw new Error('No call object in Vapi payload');
  }
  
  // Extract phone number info
  const phoneNumber = call.phoneNumber;
  const vapiPhoneId = call.phoneNumberId;
  
  if (!phoneNumber && !vapiPhoneId) {
    throw new Error('No phone number information in Vapi call');
  }
  
  // Look up which account/clinic this phone belongs to
  const vapiPhone = await prisma.vapiPhoneNumber.findFirst({
    where: {
      OR: [
        phoneNumber ? { phoneNumber } : undefined,
        vapiPhoneId ? { vapiPhoneId } : undefined,
      ].filter(Boolean) as any[]
    },
    include: {
      account: true,
      pmsIntegration: true
    }
  });
  
  if (!vapiPhone) {
    throw new Error(`No configuration found for phone number: ${phoneNumber || vapiPhoneId}`);
  }
  
  if (!vapiPhone.pmsIntegration) {
    throw new Error(`Phone number ${phoneNumber} is not linked to a PMS integration`);
  }
  
  return {
    accountId: vapiPhone.accountId,
    pmsIntegrationId: vapiPhone.pmsIntegration.id,
    phoneNumber: vapiPhone.phoneNumber,
    vapiPhoneId: vapiPhone.vapiPhoneId,
    vapiCallId: call.id,
    customerPhone: customer?.number,
    customerName: customer?.name
  };
}

/**
 * Get account ID from Vapi context (backward compatible)
 * Legacy function - use getContextFromVapiCall for new code
 */
export function getAccountIdFromVapiContext(data: any): string | null {
  // Try to extract from various possible locations
  const accountId = 
    data.call?.metadata?.accountId ||
    data.assistant?.metadata?.accountId ||
    data.squad?.metadata?.accountId ||
    data.metadata?.accountId;
  
  return accountId || null;
}

/**
 * Metadata that Vapi provides in webhooks:
 * 
 * {
 *   "call": {
 *     "id": "call-abc123",
 *     "phoneNumberId": "phone-vapi-456",
 *     "phoneNumber": "+15551234567",
 *     "customer": {
 *       "number": "+15559876543",
 *       "name": "John Smith"
 *     },
 *     "startedAt": "2024-02-09T...",
 *     "metadata": {
 *       // Custom metadata you set
 *       "accountId": "...",
 *       "clinicName": "..."
 *     }
 *   },
 *   "assistant": {
 *     "id": "assistant-789",
 *     "name": "Dental Receptionist"
 *   },
 *   "squad": {
 *     "id": "squad-xyz",
 *     "name": "Dental Office Squad"
 *   },
 *   "tool": {
 *     "name": "searchPatients"
 *   },
 *   "parameters": {
 *     "query": "John Smith"
 *   }
 * }
 */
