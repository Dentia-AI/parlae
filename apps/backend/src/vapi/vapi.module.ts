import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VapiToolsController } from './vapi-tools.controller';
import { VapiToolsService } from './vapi-tools.service';

@Module({
  imports: [PrismaModule],
  controllers: [VapiToolsController],
  providers: [VapiToolsService],
  exports: [VapiToolsService],
})
export class VapiModule {}
