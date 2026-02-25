import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentToolsModule } from '../agent-tools/agent-tools.module';
import { RetellToolController } from './retell-tool.controller';
import { RetellWebhookController } from './retell-webhook.controller';
import { RetellTemplateService } from './retell-template.service';

@Module({
  imports: [PrismaModule, AgentToolsModule],
  controllers: [RetellToolController, RetellWebhookController],
  providers: [RetellTemplateService],
  exports: [RetellTemplateService],
})
export class RetellModule {}
