import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import twilio from 'twilio';

const VoiceResponse = twilio.twiml.VoiceResponse;

@Injectable()
export class TwilioVoiceService {
  private readonly logger = new Logger(TwilioVoiceService.name);

  constructor(private prisma: PrismaService) {}

  async handleInboundCall(formData: any) {
    try {
      const from = formData.From as string;
      const to = formData.To as string;
      const callSid = formData.CallSid as string;

      this.logger.log({ from, to, callSid });

      // Identify clinic
      const clinic = await this.identifyClinic(to);

      if (!clinic) {
        this.logger.error({ to, callSid });
        return this.createErrorResponse('Number not configured');
      }

      this.logger.log({
        clinicId: clinic.accountId,
        clinicName: clinic.account?.name,
      });

      // Check availability
      // TODO: Add aiAvailabilitySettings to Account schema
      const availability = await this.checkAvailabilitySettings(
        clinic.accountId,
        (clinic.account as any)?.aiAvailabilitySettings,
      );

      if (!availability.available) {
        this.logger.log({ reason: availability.reason });
        return this.routeToFallback(clinic, availability.reason);
      }

      // Connect to Vapi
      return this.connectToVapi(clinic, from, callSid);
    } catch (error) {
      this.logger.error(error);
      return this.createErrorResponse('Internal error');
    }
  }

  private async identifyClinic(to: string) {
    // Try SIP URI format
    if (to.includes('@')) {
      const slug = to.split('@')[0];

      // TODO: Add sipUri field to VapiPhoneNumber schema
      const bySipUri = await this.prisma.vapiPhoneNumber.findFirst({
        where: { ...(to as any) }, // Placeholder
        include: { account: true },
      });

      if (bySipUri) return bySipUri;

      const bySlug = await this.prisma.vapiPhoneNumber.findFirst({
        where: { account: { slug } },
        include: { account: true },
      });

      if (bySlug) return bySlug;
    }

    // Try phone number
    // TODO: Add twilioNumber and originalPhoneNumber to schema
    const byPhoneNumber = await this.prisma.vapiPhoneNumber.findFirst({
      where: {
        ...(to as any), // Placeholder until schema is updated
      },
      include: { account: true },
    });

    return byPhoneNumber;
  }

  private async checkAvailabilitySettings(accountId: string, settings: any) {
    const mode = settings?.mode || 'always';

    switch (mode) {
      case 'always':
        return { available: true, reason: 'always-on' };
      case 'disabled':
        return { available: false, reason: 'disabled' };
      case 'after-hours-only':
        const isAfterHours = !this.isWithinBusinessHours(
          new Date(),
          settings.afterHours,
        );
        return {
          available: isAfterHours,
          reason: isAfterHours ? 'after-hours' : 'business-hours',
        };
      case 'overflow-only':
        const activeCallsCount = await this.getActiveCallsCount(accountId);
        const threshold = settings.highVolume?.threshold || 5;
        return {
          available: activeCallsCount >= threshold,
          reason:
            activeCallsCount >= threshold ? 'overflow' : 'under-capacity',
        };
      default:
        return { available: true, reason: 'default' };
    }
  }

  private isWithinBusinessHours(now: Date, afterHoursSettings: any): boolean {
    if (!afterHoursSettings?.enabled) return true;

    const businessHours = afterHoursSettings.businessHours;
    const timezone = businessHours?.timezone || 'America/Toronto';

    const localTime = new Date(
      now.toLocaleString('en-US', { timeZone: timezone }),
    );
    const dayOfWeek = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ][localTime.getDay()];
    const currentTime = localTime.toTimeString().slice(0, 5);

    const daySchedule = businessHours?.schedule?.[dayOfWeek];

    if (!daySchedule) return false;

    return (
      currentTime >= daySchedule.open && currentTime < daySchedule.close
    );
  }

  private async getActiveCallsCount(accountId: string): Promise<number> {
    // TODO: Add VapiCallLog model to schema
    // const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // return this.prisma.vapiCallLog.count({
    //   where: {
    //     accountId,
    //     status: 'in-progress',
    //     createdAt: { gte: oneHourAgo },
    //   },
    // });
    
    // Placeholder: return 0 until VapiCallLog is added
    return 0;
  }

  private routeToFallback(clinic: any, reason: string) {
    const twiml = new VoiceResponse();
    const settings = clinic.account?.aiAvailabilitySettings as any;
    const fallback = settings?.fallback || { type: 'voicemail' };

    switch (fallback.type) {
      case 'voicemail':
        const greeting =
          fallback.voicemailGreeting ||
          `Thank you for calling ${clinic.account?.name}. We're unable to take your call right now. Please leave a message after the beep.`;

        twiml.say(greeting);
        twiml.record({
          maxLength: 180,
          recordingStatusCallback: `${process.env.APP_BASE_URL}/api/twilio/voicemail`,
          recordingStatusCallbackEvent: ['completed'],
          transcribe: true,
          transcribeCallback: `${process.env.APP_BASE_URL}/api/twilio/voicemail-transcription`,
        });
        break;

      case 'forward':
        if (fallback.forwardNumber) {
          twiml.say('Please hold while I connect you.');
          twiml.dial(fallback.forwardNumber);
        } else {
          twiml.say(
            "We apologize, but we're unable to take your call right now. Please try again later.",
          );
          twiml.hangup();
        }
        break;

      case 'busy-signal':
        twiml.say(
          "We're unable to take your call right now. Please try again later.",
        );
        twiml.hangup();
        break;
    }

    return twiml.toString();
  }

  private connectToVapi(clinic: any, from: string, callSid: string) {
    const twiml = new VoiceResponse();

    const dial = twiml.dial({
      answerOnBridge: true,
      action: `${process.env.APP_BASE_URL}/api/twilio/call-complete`,
      method: 'POST',
    });

    // Construct SIP URI with credentials
    const sipUri = `sip:${clinic.vapiPhoneId}@sip.vapi.ai`;
    dial.sip(
      {
        username: clinic.vapiPhoneId,
        password: process.env.VAPI_API_KEY!,
      },
      sipUri,
    );

    return twiml.toString();
  }

  private createErrorResponse(message: string) {
    const twiml = new VoiceResponse();
    twiml.say(
      'We apologize, but we encountered an error. Please try calling again.',
    );
    twiml.hangup();
    return twiml.toString();
  }
}
