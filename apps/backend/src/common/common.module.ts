import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { SecretsService } from './services/secrets.service';
import { HipaaAuditService } from './services/hipaa-audit.service';
import { AiActionLogCleanupService } from './services/ai-action-log-cleanup.service';

@Global()
@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  providers: [SecretsService, HipaaAuditService, AiActionLogCleanupService],
  exports: [SecretsService, HipaaAuditService],
})
export class CommonModule {}
