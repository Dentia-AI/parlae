import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VapiToolsController } from './vapi-tools.controller';
import { VapiWebhookController } from './vapi-webhook.controller';
import { VapiToolsService } from './vapi-tools.service';

@Module({
  imports: [PrismaModule],
  controllers: [VapiToolsController, VapiWebhookController],
  providers: [VapiToolsService],
  exports: [VapiToolsService],
})
export class VapiModule {}
