import { Controller, Post, Body, Logger } from '@nestjs/common';
import { TwilioVoiceService } from './twilio-voice.service';

@Controller('twilio')
export class TwilioVoiceController {
  private readonly logger = new Logger(TwilioVoiceController.name);

  constructor(private readonly twilioVoiceService: TwilioVoiceService) {}

  @Post('voice')
  async handleVoiceWebhook(@Body() body: any) {
    this.logger.log('Twilio voice webhook received');
    const twiml = await this.twilioVoiceService.handleInboundCall(body);
    
    // Return TwiML as XML
    return twiml;
  }
}
