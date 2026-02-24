import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../common/structured-logger';
import * as crypto from 'crypto';

/**
 * Retell Webhook Controller
 *
 * Handles Retell AI lifecycle events: call_started, call_ended, call_analyzed.
 * These are sent to the agent's webhook_url (not the tool URLs).
 *
 * Retell webhook payload:
 *   { event: "call_started"|"call_ended"|"call_analyzed", call: { call_id, agent_id, ... } }
 *
 * Signature verification uses HMAC-SHA256 of the raw body with the Retell API key.
 */
@Controller('retell')
export class RetellWebhookController {
  private readonly logger = new StructuredLogger(RetellWebhookController.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('[Retell Webhook] Controller initialized');
  }

  @Post('webhook')
  async handleWebhook(
    @Body() body: any,
    @Headers('x-retell-signature') signature: string,
  ) {
    const event = body?.event;
    const callId = body?.call?.call_id;

    this.logger.log(`[Retell Webhook] Event: ${event}, Call ID: ${callId}`);

    switch (event) {
      case 'call_started':
        return this.handleCallStarted(body);

      case 'call_ended':
        return this.handleCallEnded(body);

      case 'call_analyzed':
        return this.handleCallAnalyzed(body);

      case 'transcript_updated':
        return { received: true };

      default:
        this.logger.warn(`[Retell Webhook] Unhandled event: ${event}`);
        return { received: true };
    }
  }

  private async handleCallStarted(body: any): Promise<{ received: true }> {
    const call = body?.call;
    const callId = call?.call_id;
    if (!callId) return { received: true };

    const accountId = await this.resolveAccountFromCall(call);
    if (accountId) {
      try {
        await this.prisma.callReference.upsert({
          where: { vapiCallId: callId },
          create: {
            vapiCallId: callId,
            accountId,
            provider: 'RETELL',
          },
          update: {},
        });
        this.logger.log(`[Retell] Call reference created: ${callId}`);
      } catch (err) {
        this.logger.error(
          `[Retell] Failed to create call reference: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { received: true };
  }

  private async handleCallEnded(body: any): Promise<{ received: true }> {
    const call = body?.call;
    this.logger.log(
      `[Retell] Call ended: ${call?.call_id}, status: ${call?.call_status}, duration: ${call?.end_timestamp && call?.start_timestamp ? Math.round((call.end_timestamp - call.start_timestamp) / 1000) : '?'}s`,
    );
    return { received: true };
  }

  private async handleCallAnalyzed(body: any): Promise<{ received: true }> {
    const call = body?.call;
    const analysis = call?.call_analysis;
    if (analysis) {
      this.logger.log(
        `[Retell] Call analyzed: ${call?.call_id}, summary: ${JSON.stringify(analysis).slice(0, 300)}`,
      );
    }
    return { received: true };
  }

  private async resolveAccountFromCall(call: any): Promise<string | null> {
    // 1. Agent metadata
    const metadataAccountId = call?.metadata?.accountId;
    if (metadataAccountId) return metadataAccountId;

    // 2. RetellPhoneNumber by agent ID
    const agentId = call?.agent_id;
    if (agentId) {
      try {
        const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
          where: { retellAgentId: agentId },
          select: { accountId: true },
        });
        if (retellPhone) return retellPhone.accountId;
      } catch {
        // continue to next resolution method
      }
    }

    // 3. RetellPhoneNumber by phone number
    const phoneNumber = call?.to_number;
    if (phoneNumber) {
      try {
        const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
          where: { phoneNumber },
          select: { accountId: true },
        });
        if (retellPhone) return retellPhone.accountId;
      } catch {
        // continue
      }
    }

    this.logger.warn(`[Retell] Could not resolve account for call ${call?.call_id}`);
    return null;
  }

  /**
   * Verify Retell webhook signature.
   * Retell signs with HMAC-SHA256 using the API key.
   */
  static verifySignature(
    rawBody: string,
    signature: string,
    apiKey: string,
  ): boolean {
    if (!signature || !apiKey) return false;
    const expected = crypto
      .createHmac('sha256', apiKey)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  }
}
