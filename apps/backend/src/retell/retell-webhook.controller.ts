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
      const rawBody: Buffer | undefined = (req as any).rawBody;
      const rawBodyStr = rawBody ? rawBody.toString('utf8') : undefined;
      const jsonStr = JSON.stringify(body);

      // Try rawBody first, then JSON.stringify (Retell SDK recommended), then IP allowlist
      const rawValid = rawBodyStr
        ? await RetellWebhookController.verifySignature(rawBodyStr, signature, apiKey)
        : false;

      let jsonValid = false;
      let verifiedVia: string | undefined;

      if (rawValid) {
        verifiedVia = 'rawBody';
      } else {
        jsonValid = await RetellWebhookController.verifySignature(jsonStr, signature, apiKey);
        if (jsonValid) {
          verifiedVia = 'json_stringify';
        }
      }

      if (!rawValid && !jsonValid) {
        const clientIp = RetellWebhookController.extractClientIp(req);
        const ipAllowed = RetellWebhookController.RETELL_IPS.includes(clientIp);

        if (ipAllowed) {
          verifiedVia = 'ip_allowlist';
          this.logger.warn({
            clientIp,
            msg: '[Retell Webhook] HMAC failed but IP matches Retell allowlist — accepting',
          });
        } else {
          this.logger.error({
            hasRawBody: !!rawBody,
            rawBodyLen: rawBody?.length,
            rawBodyStrLen: rawBodyStr?.length,
            jsonStrLen: jsonStr.length,
            bodyMatch: rawBodyStr === jsonStr,
            hasSignature: !!signature,
            signaturePrefix: signature?.slice(0, 30),
            apiKeyPrefix: apiKey.slice(0, 8) + '...',
            clientIp,
            failReason: RetellWebhookController._lastFailReason || 'pre-check',
            msg: '[Retell Webhook] Invalid signature — rejecting request',
          });
          throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }
      }

      if (verifiedVia && verifiedVia !== 'rawBody') {
        this.logger.log({ verifiedVia, msg: '[Retell Webhook] Signature verified via fallback' });
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
    const callId = call?.call_id;
    const durationSec =
      call?.end_timestamp && call?.start_timestamp
        ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
        : null;

    this.logger.log(
      `[Retell] Call ended: ${callId}, status: ${call?.call_status}, duration: ${durationSec ?? '?'}s`,
    );

    await this.processOutboundCallEnded(call, durationSec);

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

    await this.processOutboundCallAnalyzed(call, analysis);

    return { received: true };
  }

  /**
   * When an outbound call ends, update the CampaignContact status and
   * handle re-queue logic for failed attempts.
   */
  private async processOutboundCallEnded(call: any, durationSec: number | null): Promise<void> {
    const contactId = call?.metadata?.contactId;
    const campaignId = call?.metadata?.campaignId;
    if (!contactId || !campaignId) return;

    const callStatus = call?.call_status;
    const disconnectionReason = call?.disconnection_reason;

    let status: string;
    let outcome: string | undefined;

    switch (disconnectionReason) {
      case 'agent_hangup':
      case 'user_hangup':
        status = 'COMPLETED';
        outcome = 'answered';
        break;
      case 'voicemail_reached':
        status = 'VOICEMAIL';
        outcome = 'voicemail_left';
        break;
      case 'no_answer':
        status = 'NO_ANSWER';
        break;
      case 'busy':
        status = 'BUSY';
        break;
      case 'machine_detected':
        status = 'VOICEMAIL';
        outcome = 'machine_detected';
        break;
      default:
        status = callStatus === 'error' ? 'FAILED' : 'COMPLETED';
        break;
    }

    try {
      const contact = await this.prisma.campaignContact.findUnique({
        where: { id: contactId },
      });
      if (!contact) return;

      const campaign = await this.prisma.outboundCampaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) return;

      const isTerminal = ['COMPLETED', 'VOICEMAIL'].includes(status);
      const shouldRetry =
        !isTerminal &&
        contact.attempts < campaign.maxAttemptsPerContact;

      await this.prisma.campaignContact.update({
        where: { id: contactId },
        data: {
          status: shouldRetry ? 'QUEUED' : (status as any),
          callDurationSec: durationSec,
          outcome: outcome || disconnectionReason || callStatus,
          ...(isTerminal || !shouldRetry ? { completedAt: new Date() } : {}),
        },
      });

      if (isTerminal || !shouldRetry) {
        const isSuccessful = status === 'COMPLETED' && (durationSec || 0) > 10;
        await this.prisma.outboundCampaign.update({
          where: { id: campaignId },
          data: {
            completedCount: { increment: 1 },
            ...(isSuccessful ? { successfulCount: { increment: 1 } } : {}),
          },
        });

        const remaining = await this.prisma.campaignContact.count({
          where: {
            campaignId,
            status: { in: ['QUEUED', 'DIALING', 'IN_PROGRESS'] },
          },
        });
        if (remaining === 0) {
          await this.prisma.outboundCampaign.update({
            where: { id: campaignId },
            data: { status: 'COMPLETED' },
          });
          this.logger.log({ campaignId, msg: '[Outbound] Campaign completed' });
        }
      }

      if (disconnectionReason === 'user_hangup' && (durationSec || 0) < 3) {
        this.logger.log({
          contactId,
          phoneNumber: contact.phoneNumber,
          msg: '[Outbound] Very short call — potential DNC candidate (not auto-adding yet)',
        });
      }
    } catch (err) {
      this.logger.error({
        contactId,
        campaignId,
        err: err instanceof Error ? err.message : err,
        msg: '[Outbound] Error processing outbound call_ended',
      });
    }
  }

  /**
   * When call analysis is ready, update the CampaignContact with
   * sentiment, summary, and analysis data.
   */
  private async processOutboundCallAnalyzed(call: any, analysis: any): Promise<void> {
    const contactId = call?.metadata?.contactId;
    const campaignId = call?.metadata?.campaignId;
    const accountId = call?.metadata?.accountId;
    if (!contactId) return;

    try {
      const updateData: Record<string, unknown> = {};

      if (analysis?.call_summary) {
        updateData.summary = analysis.call_summary;
      }
      if (analysis?.user_sentiment) {
        updateData.sentiment = analysis.user_sentiment;
      }

      const customData = analysis?.custom_analysis_data;
      if (customData) {
        updateData.analysisData = customData;

        if (customData.outcome) {
          updateData.outcome = customData.outcome;
        }

        if (customData.do_not_call === true || customData.do_not_call === 'true') {
          const contact = await this.prisma.campaignContact.findUnique({
            where: { id: contactId },
            select: { phoneNumber: true },
          });
          if (contact && accountId) {
            await this.prisma.doNotCallEntry.upsert({
              where: {
                accountId_phoneNumber: {
                  accountId,
                  phoneNumber: contact.phoneNumber,
                },
              },
              update: { reason: 'auto_detected', source: 'call_analysis' },
              create: {
                accountId,
                phoneNumber: contact.phoneNumber,
                reason: 'auto_detected',
                source: 'call_analysis',
              },
            });
            this.logger.log({
              accountId,
              phoneNumber: contact.phoneNumber,
              msg: '[Outbound] Auto-added to DNC list from call analysis',
            });
          }
        }
      }

      if (Object.keys(updateData).length > 0) {
        await this.prisma.campaignContact.update({
          where: { id: contactId },
          data: updateData,
        });
      }
    } catch (err) {
      this.logger.error({
        contactId,
        campaignId,
        err: err instanceof Error ? err.message : err,
        msg: '[Outbound] Error processing outbound call_analyzed',
      });
    }
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

    const drift = Math.abs(Date.now() - timestamp);
    if (drift > RetellWebhookController.SIGNATURE_TOLERANCE_MS) {
      RetellWebhookController._lastFailReason = `timestamp_drift_${Math.round(drift / 1000)}s`;
      return false;
    }

    const expected = crypto
      .createHmac('sha256', apiKey)
      .update(body + timestamp)
      .digest('hex');

    if (digest.length !== expected.length) {
      RetellWebhookController._lastFailReason = `digest_len_mismatch_${digest.length}_vs_${expected.length}`;
      return false;
    }

    const valid = crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected));
    if (!valid) {
      RetellWebhookController._lastFailReason = 'hmac_mismatch';
    }
    return valid;
  }

  static _lastFailReason = '';

  /** Known Retell IP addresses (per https://docs.retellai.com/features/secure-webhook) */
  private static readonly RETELL_IPS = ['100.20.5.228'];

  private static extractClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0]!.trim();
    if (Array.isArray(forwarded) && forwarded.length) return forwarded[0]!.split(',')[0]!.trim();
    return req.socket?.remoteAddress || '';
  }
}
