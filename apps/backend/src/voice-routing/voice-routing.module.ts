import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VoiceRoutingController } from './voice-routing.controller';

@Module({
  imports: [PrismaModule],
  controllers: [VoiceRoutingController],
})
export class VoiceRoutingModule {}
