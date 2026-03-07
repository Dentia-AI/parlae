import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { HipaaAuditService } from './services/hipaa-audit.service';
import { AiActionLogCleanupService } from './services/ai-action-log-cleanup.service';
import { ActionItemService } from './services/action-item.service';
import { ActionItemCleanupService } from './services/action-item-cleanup.service';

@Global()
@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  providers: [
    HipaaAuditService,
    AiActionLogCleanupService,
    ActionItemService,
    ActionItemCleanupService,
  ],
  exports: [HipaaAuditService, ActionItemService],
})
export class CommonModule {}
