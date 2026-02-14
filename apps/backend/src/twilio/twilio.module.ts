import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TwilioVoiceController } from './twilio-voice.controller';
import { TwilioVoiceService } from './twilio-voice.service';
import { TwilioMessagingService } from './twilio-messaging.service';

@Module({
  imports: [PrismaModule],
  controllers: [TwilioVoiceController],
  providers: [TwilioVoiceService, TwilioMessagingService],
  exports: [TwilioVoiceService, TwilioMessagingService],
})
export class TwilioModule {}
