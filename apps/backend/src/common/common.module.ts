import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SecretsService } from './services/secrets.service';
import { HipaaAuditService } from './services/hipaa-audit.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [SecretsService, HipaaAuditService],
  exports: [SecretsService, HipaaAuditService],
})
export class CommonModule {}
