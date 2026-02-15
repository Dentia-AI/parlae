import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { VapiToolsController } from './vapi-tools.controller';
import { VapiWebhookController } from './vapi-webhook.controller';
import { VapiToolsService } from './vapi-tools.service';

@Module({
  imports: [PrismaModule, GoogleCalendarModule],
  controllers: [VapiToolsController, VapiWebhookController],
  providers: [VapiToolsService],
  exports: [VapiToolsService],
})
export class VapiModule {}
