import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../common/structured-logger';

/**
 * Voice Routing Controller
 *
 * Provides a TwiML endpoint that routes inbound calls to either Vapi or Retell
 * based on the global VoiceProviderToggle setting.
 *
 * How it works:
 * 1. The clinic's primary Twilio number has its voice_url set to POST /voice-routing/route
 * 2. When a call comes in, this endpoint checks the global toggle
 * 3. Returns TwiML that <Dial>s the appropriate provider's phone number
 *
 * This allows instant switching between providers without changing Twilio number configuration.
 */
@Controller('voice-routing')
export class VoiceRoutingController {
  private readonly logger = new StructuredLogger(VoiceRoutingController.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('[VoiceRouting] Controller initialized');
  }

  /**
   * POST /voice-routing/route
   *
   * Twilio calls this endpoint when an inbound call arrives.
   * Returns TwiML that forwards to the active provider's number.
   *
   * Twilio sends form-encoded data with:
   *   - To: the called number (clinic's primary number)
   *   - From: the caller's number
   *   - CallSid: Twilio call SID
   */
  @Post('route')
  async routeCall(@Body() body: any, @Res() res: Response) {
    const calledNumber = body?.To;
    const callerNumber = body?.From;
    const callSid = body?.CallSid;

    this.logger.log(
      `[VoiceRouting] Inbound call: ${callerNumber} → ${calledNumber} (SID: ${callSid})`,
    );

    try {
      // Resolution order:
      // 1. Account.voiceProviderOverride (per-account testing)
      // 2. VoiceProviderToggle.activeProvider (global emergency switch)
      // 3. Default: VAPI

      // Look up the account that owns this number
      const vapiPhone = await this.prisma.vapiPhoneNumber.findFirst({
        where: { phoneNumber: calledNumber },
        select: {
          accountId: true,
          phoneNumber: true,
          account: { select: { voiceProviderOverride: true } },
        },
      });

      // Determine effective provider: per-account override > global toggle > default
      let activeProvider: string;

      if (vapiPhone?.account?.voiceProviderOverride) {
        activeProvider = vapiPhone.account.voiceProviderOverride;
        this.logger.log(
          `[VoiceRouting] Per-account override active for ${vapiPhone.accountId}: ${activeProvider}`,
        );
      } else {
        const toggle = await this.prisma.voiceProviderToggle.findFirst({
          where: { id: 1 },
        });
        activeProvider = toggle?.activeProvider || 'VAPI';
      }

      let forwardTo: string | null = null;

      if (activeProvider === 'RETELL') {
        if (vapiPhone) {
          const retellPhone = await this.prisma.retellPhoneNumber.findFirst({
            where: { accountId: vapiPhone.accountId, isActive: true },
            select: { phoneNumber: true },
          });
          forwardTo = retellPhone?.phoneNumber || null;
        }

        if (!forwardTo) {
          this.logger.warn(
            `[VoiceRouting] No Retell number found for ${calledNumber}, falling back to Vapi`,
          );
        }
      }

      if (activeProvider === 'VAPI' || !forwardTo) {
        forwardTo = vapiPhone?.phoneNumber || calledNumber;
      }

      this.logger.log(
        `[VoiceRouting] Routing to ${activeProvider}: ${forwardTo}`,
      );

      const twiml = this.buildTwiml(forwardTo, callerNumber);

      res.set('Content-Type', 'text/xml');
      res.status(HttpStatus.OK).send(twiml);
    } catch (error) {
      this.logger.error(
        `[VoiceRouting] Error: ${error instanceof Error ? error.message : error}`,
      );

      // On error, fallback: just dial the original number
      const twiml = this.buildTwiml(calledNumber, callerNumber);
      res.set('Content-Type', 'text/xml');
      res.status(HttpStatus.OK).send(twiml);
    }
  }

  /**
   * GET /voice-routing/status
   *
   * Returns the current routing status (for admin dashboard).
   */
  @Get('status')
  async getStatus() {
    const toggle = await this.prisma.voiceProviderToggle.findFirst({
      where: { id: 1 },
    });

    const vapiCount = await this.prisma.vapiPhoneNumber.count({
      where: { isActive: true },
    });
    const retellCount = await this.prisma.retellPhoneNumber.count({
      where: { isActive: true },
    });

    const overrideAccounts = await this.prisma.account.findMany({
      where: { voiceProviderOverride: { not: null } },
      select: { id: true, name: true, voiceProviderOverride: true },
    });

    return {
      activeProvider: toggle?.activeProvider || 'VAPI',
      switchedAt: toggle?.switchedAt || null,
      vapiPhoneNumbers: vapiCount,
      retellPhoneNumbers: retellCount,
      retellReady: retellCount > 0,
      accountOverrides: overrideAccounts,
    };
  }

  private buildTwiml(forwardTo: string, callerNumber?: string): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      `  <Dial callerId="${callerNumber || ''}">`,
      `    <Number>${forwardTo}</Number>`,
      '  </Dial>',
      '</Response>',
    ].join('\n');
  }
}
