import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AgentToolsService } from '../agent-tools/agent-tools.service';
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
 * Signature format: "v=<timestamp>,d=<HMAC-SHA256(apiKey, body+timestamp)>"
 */
@Controller('retell')
export class RetellWebhookController {
  private readonly logger = new StructuredLogger(RetellWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentToolsService: AgentToolsService,
  ) {
    this.logger.log('[Retell Webhook] Controller initialized');
  }

  @Post('webhook')
  async handleWebhook(
    @Body() body: any,
    @Headers('x-retell-signature') signature: string,
    @Req() req: Request,
  ) {
    const apiKey = process.env.RETELL_API_KEY;
    if (apiKey) {
      const rawBody = (req as any).rawBody;
      const bodyStr = rawBody ? rawBody.toString('utf8') : JSON.stringify(body);
      const isValid = await RetellWebhookController.verifySignature(
        bodyStr,
        signature,
        apiKey,
      );
      if (!isValid) {
        this.logger.error('[Retell Webhook] Invalid signature — rejecting request');
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
    }

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
          where: { callId: callId },
          create: {
            callId: callId,
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

      if (call.from_number) {
        this.agentToolsService
          .prefetchCallerContext(callId, call.from_number, accountId, 'RETELL')
          .catch((err) =>
            this.logger.error(`[Retell] Caller context prefetch failed: ${err instanceof Error ? err.message : err}`),
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

  private static readonly SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

  /**
   * Verify Retell webhook signature.
   *
   * Retell signs as: HMAC-SHA256(apiKey, body + timestamp)
   * Signature header format: "v=<timestamp>,d=<hex digest>"
   */
  static async verifySignature(
    body: string,
    signature: string,
    apiKey: string,
  ): Promise<boolean> {
    if (!signature || !apiKey) return false;

    const match = /^v=(\d+),d=(.+)$/.exec(signature);
    if (!match) return false;

    const timestamp = Number(match[1]);
    const digest = match[2];

    if (Math.abs(Date.now() - timestamp) > RetellWebhookController.SIGNATURE_TOLERANCE_MS) {
      return false;
    }

    const expected = crypto
      .createHmac('sha256', apiKey)
      .update(body + timestamp)
      .digest('hex');

    if (digest.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected));
  }
}
