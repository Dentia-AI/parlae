import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PmsController } from './pms.controller';
import { PmsService } from './pms.service';
import { SikkaTokenRefreshService } from './providers/sikka-token.service';
import { SikkaWritebackService } from './providers/sikka-writeback.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PmsController],
  providers: [
    PmsService,
    SikkaTokenRefreshService,
    SikkaWritebackService,
  ],
  exports: [PmsService],
})
export class PmsModule {}
