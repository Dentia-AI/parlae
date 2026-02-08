import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

// Services
import { GhlSubAccountService } from './services/ghl-sub-account.service';
import { GhlVoiceAgentService } from './services/ghl-voice-agent.service';
import { GhlVoiceService } from './services/ghl-voice.service';
import { GhlPhoneService } from './services/ghl-phone.service';
import { GhlKnowledgeBaseService } from './services/ghl-knowledge-base.service';
import { GhlMarketplaceService } from './services/ghl-marketplace.service';

// Controllers
import { GhlSubAccountController } from './controllers/ghl-sub-account.controller';
import { GhlVoiceAgentController } from './controllers/ghl-voice-agent.controller';
import { GhlVoiceController } from './controllers/ghl-voice.controller';
import { GhlPhoneController } from './controllers/ghl-phone.controller';
import { GhlKnowledgeBaseController } from './controllers/ghl-knowledge-base.controller';
import { GhlMarketplaceController } from './controllers/ghl-marketplace.controller';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  controllers: [
    GhlSubAccountController,
    GhlVoiceAgentController,
    GhlVoiceController,
    GhlPhoneController,
    GhlKnowledgeBaseController,
    GhlMarketplaceController,
  ],
  providers: [
    GhlSubAccountService,
    GhlVoiceAgentService,
    GhlVoiceService,
    GhlPhoneService,
    GhlKnowledgeBaseService,
    GhlMarketplaceService,
  ],
  exports: [
    GhlSubAccountService,
    GhlVoiceAgentService,
    GhlVoiceService,
    GhlPhoneService,
    GhlKnowledgeBaseService,
    GhlMarketplaceService,
  ],
})
export class GhlModule {}


