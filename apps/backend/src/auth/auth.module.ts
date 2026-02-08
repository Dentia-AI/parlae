import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CognitoAuthGuard } from './cognito-auth.guard';
import { CognitoJwtVerifierService } from './cognito-jwt-verifier.service';
import { DevAuthGuard } from './dev-auth.guard';

@Module({
  imports: [ConfigModule],
  providers: [CognitoJwtVerifierService, CognitoAuthGuard, DevAuthGuard],
  exports: [CognitoJwtVerifierService, CognitoAuthGuard, DevAuthGuard],
})
export class AuthModule {}
