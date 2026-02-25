import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { VoiceRoutingController } from './voice-routing.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VoiceRoutingController],
})
export class VoiceRoutingModule {}
