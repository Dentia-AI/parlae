import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VapiModule } from '../vapi/vapi.module';
import { RetellToolController } from './retell-tool.controller';
import { RetellWebhookController } from './retell-webhook.controller';

@Module({
  imports: [PrismaModule, VapiModule],
  controllers: [RetellToolController, RetellWebhookController],
})
export class RetellModule {}
