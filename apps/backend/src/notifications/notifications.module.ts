import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TwilioModule } from '../twilio/twilio.module';

@Module({
  imports: [PrismaModule, TwilioModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
