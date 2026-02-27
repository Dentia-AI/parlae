import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { RetellModule } from '../retell/retell.module';
import { OutboundController } from './outbound.controller';
import { OutboundCampaignService } from './services/outbound-campaign.service';
import { OutboundSettingsService } from './services/outbound-settings.service';
import { OutboundDispatcherService } from './services/outbound-dispatcher.service';
import { OutboundSchedulerService } from './services/outbound-scheduler.service';

@Module({
  imports: [PrismaModule, RetellModule, ScheduleModule.forRoot()],
  controllers: [OutboundController],
  providers: [
    OutboundCampaignService,
    OutboundSettingsService,
    OutboundDispatcherService,
    OutboundSchedulerService,
  ],
  exports: [
    OutboundCampaignService,
    OutboundSettingsService,
    OutboundSchedulerService,
  ],
})
export class OutboundModule {}
