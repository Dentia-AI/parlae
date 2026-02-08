import {
  Controller,
  Post,
  Body,
  Headers,
  RawBodyRequest,
  Req,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentService, CreatePaymentDto } from './services/payment.service';
import { RefundService, CreateRefundDto } from './services/refund.service';
import { WebhookService } from './services/webhook.service';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { Payment, Refund } from '@kit/prisma';

@Controller('stripe')
export class StripeController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly refundService: RefundService,
    private readonly webhookService: WebhookService,
  ) {}

  /**
   * Create a checkout session
   */
  @Post('create-checkout-session')
  @UseGuards(CognitoAuthGuard)
  async createCheckoutSession(@Body() dto: CreatePaymentDto) {
    return this.paymentService.createCheckoutSession(dto);
  }

  /**
   * Get user payments
   */
  @Get('payments/user/:userId')
  @UseGuards(CognitoAuthGuard)
  async getUserPayments(@Param('userId') userId: string): Promise<Payment[]> {
    return this.paymentService.getUserPayments(userId);
  }

  /**
   * Get account payments
   */
  @Get('payments/account/:accountId')
  @UseGuards(CognitoAuthGuard)
  async getAccountPayments(@Param('accountId') accountId: string): Promise<Payment[]> {
    return this.paymentService.getAccountPayments(accountId);
  }

  /**
   * Get payment by ID
   */
  @Get('payments/:paymentId')
  @UseGuards(CognitoAuthGuard)
  async getPaymentById(@Param('paymentId') paymentId: string): Promise<Payment | null> {
    return this.paymentService.getPaymentById(paymentId);
  }

  /**
   * Create a refund
   */
  @Post('refunds')
  @UseGuards(CognitoAuthGuard)
  async createRefund(@Body() dto: CreateRefundDto): Promise<Refund> {
    return this.refundService.createRefund(dto);
  }

  /**
   * Get refunds for a payment
   */
  @Get('refunds/payment/:paymentId')
  @UseGuards(CognitoAuthGuard)
  async getPaymentRefunds(@Param('paymentId') paymentId: string): Promise<Refund[]> {
    return this.refundService.getPaymentRefunds(paymentId);
  }

  /**
   * Stripe webhook endpoint
   */
  @Post('webhook')
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const payload = request.rawBody;

    if (!payload) {
      throw new Error('Missing request body');
    }

    const event = this.webhookService.constructEvent(
      Buffer.from(payload),
      signature,
    );

    await this.webhookService.handleEvent(event);

    return { received: true };
  }
}

