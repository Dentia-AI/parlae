import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgentToolsService } from './agent-tools.service';

@Module({
  imports: [PrismaModule, GoogleCalendarModule, NotificationsModule],
  providers: [AgentToolsService],
  exports: [AgentToolsService],
})
export class AgentToolsModule {}
