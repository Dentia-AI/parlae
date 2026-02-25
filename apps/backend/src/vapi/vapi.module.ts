import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentToolsModule } from '../agent-tools/agent-tools.module';
import { VapiToolsController } from './vapi-tools.controller';
import { VapiWebhookController } from './vapi-webhook.controller';

@Module({
  imports: [PrismaModule, AgentToolsModule],
  controllers: [VapiToolsController, VapiWebhookController],
})
export class VapiModule {}
