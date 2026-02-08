import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StripeService } from './services/stripe.service';
import { PaymentService } from './services/payment.service';
import { WebhookService } from './services/webhook.service';
import { RefundService } from './services/refund.service';
import { RecurringBillingService } from './services/recurring-billing.service';
import { StripeController } from './stripe.controller';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, ScheduleModule.forRoot()],
  controllers: [StripeController],
  providers: [
    StripeService,
    PaymentService,
    WebhookService,
    RefundService,
    RecurringBillingService,
  ],
  exports: [PaymentService, RefundService, StripeService],
})
export class StripeModule {}

