import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TwilioVoiceController } from './twilio-voice.controller';
import { TwilioVoiceService } from './twilio-voice.service';

@Module({
  imports: [PrismaModule],
  controllers: [TwilioVoiceController],
  providers: [TwilioVoiceService],
  exports: [TwilioVoiceService],
})
export class TwilioModule {}
