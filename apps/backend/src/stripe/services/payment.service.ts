import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe.service';
import Stripe from 'stripe';
import { Payment, Prisma } from '@kit/prisma';

export interface CreatePaymentDto {
  userId: string;
  accountId?: string;
  amountCents: number;
  currency?: string;
  paymentType: 'ONE_TIME' | 'RECURRING';
  isRecurring?: boolean;
  recurringInterval?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  recurringFrequency?: number;
  metadata?: Record<string, any>;
  customerEmail: string;
  returnUrl: string;
}

export interface CreateCheckoutSessionResponse {
  sessionId: string;
  clientSecret: string;
  url: string | null;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Create a Stripe Checkout Session for one-time or recurring payment
   */
  async createCheckoutSession(
    dto: CreatePaymentDto,
  ): Promise<CreateCheckoutSessionResponse> {
    const stripe = this.stripeService.getClient();

    try {
      this.logger.log(
        `Creating checkout session for user ${dto.userId}, amount: ${dto.amountCents} ${dto.currency || 'USD'}`,
      );

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        ui_mode: 'embedded',
        mode: dto.paymentType === 'RECURRING' ? 'subscription' : 'payment',
        customer_email: dto.customerEmail,
        line_items: [
          {
            price_data: {
              currency: dto.currency || 'usd',
              product_data: {
                name:
                  dto.paymentType === 'RECURRING'
                    ? 'Recurring Payment'
                    : 'One-time Payment',
                description: `Payment for ${dto.amountCents / 100} ${dto.currency?.toUpperCase() || 'USD'}`,
              },
              unit_amount: dto.amountCents,
              ...(dto.paymentType === 'RECURRING' && dto.recurringInterval
                ? {
                    recurring: {
                      interval: this.getStripeInterval(dto.recurringInterval),
                      interval_count: dto.recurringFrequency || 1,
                    },
                  }
                : {}),
            },
            quantity: 1,
          },
        ],
        return_url: dto.returnUrl,
        metadata: {
          userId: dto.userId,
          accountId: dto.accountId || '',
          paymentType: dto.paymentType,
          ...(dto.metadata || {}),
        },
      });

      // Create payment record in database
      const nextBillingDate =
        dto.isRecurring && dto.recurringInterval
          ? this.calculateNextBillingDate(
              new Date(),
              dto.recurringInterval,
              dto.recurringFrequency || 1,
            )
          : null;

      await this.prisma.payment.create({
        data: {
          userId: dto.userId,
          accountId: dto.accountId,
          stripeCheckoutSessionId: session.id,
          amountCents: dto.amountCents,
          currency: dto.currency || 'usd',
          status: 'PENDING',
          paymentType: dto.paymentType,
          isRecurring: dto.isRecurring || false,
          recurringInterval: dto.recurringInterval,
          recurringFrequency: dto.recurringFrequency,
          nextBillingDate,
          metadata: dto.metadata,
        },
      });

      this.logger.log(`Created checkout session: ${session.id}`);

      return {
        sessionId: session.id,
        clientSecret: session.client_secret!,
        url: session.url,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create checkout session: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Process a successful payment from Stripe webhook
   */
  async processSuccessfulPayment(
    sessionId: string,
    paymentIntentId: string,
  ): Promise<void> {
    try {
      const payment = await this.prisma.payment.findFirst({
        where: { stripeCheckoutSessionId: sessionId },
      });

      if (!payment) {
        this.logger.warn(`Payment not found for session: ${sessionId}`);
        return;
      }

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCEEDED',
          stripePaymentIntentId: paymentIntentId,
          lastBillingDate: new Date(),
        },
      });

      this.logger.log(`Payment ${payment.id} marked as succeeded`);
    } catch (error) {
      this.logger.error(
        `Failed to process successful payment: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Process a failed payment from Stripe webhook
   */
  async processFailedPayment(
    sessionId: string,
    failureReason?: string,
  ): Promise<void> {
    try {
      const payment = await this.prisma.payment.findFirst({
        where: { stripeCheckoutSessionId: sessionId },
      });

      if (!payment) {
        this.logger.warn(`Payment not found for session: ${sessionId}`);
        return;
      }

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureCount: { increment: 1 },
          failureReason: failureReason || 'Payment failed',
        },
      });

      this.logger.log(
        `Payment ${payment.id} marked as failed: ${failureReason}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process failed payment: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(paymentId: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: true,
        account: true,
        refunds: true,
      },
    }) as any;
  }

  /**
   * Get payments for a user
   */
  async getUserPayments(userId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { userId },
      include: {
        account: true,
        refunds: true,
      },
      orderBy: { createdAt: 'desc' },
    }) as any;
  }

  /**
   * Get payments for an account
   */
  async getAccountPayments(accountId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { accountId },
      include: {
        user: true,
        refunds: true,
      },
      orderBy: { createdAt: 'desc' },
    }) as any;
  }

  /**
   * Convert recurring interval to Stripe interval
   */
  private getStripeInterval(
    interval: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
  ): Stripe.Price.Recurring.Interval {
    const intervalMap: Record<string, Stripe.Price.Recurring.Interval> = {
      DAILY: 'day',
      WEEKLY: 'week',
      MONTHLY: 'month',
      YEARLY: 'year',
    };
    return intervalMap[interval] || 'month';
  }

  /**
   * Calculate next billing date based on interval
   */
  private calculateNextBillingDate(
    startDate: Date,
    interval: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
    frequency: number,
  ): Date {
    const nextDate = new Date(startDate);

    switch (interval) {
      case 'DAILY':
        nextDate.setDate(nextDate.getDate() + frequency);
        break;
      case 'WEEKLY':
        nextDate.setDate(nextDate.getDate() + frequency * 7);
        break;
      case 'MONTHLY':
        nextDate.setMonth(nextDate.getMonth() + frequency);
        break;
      case 'YEARLY':
        nextDate.setFullYear(nextDate.getFullYear() + frequency);
        break;
    }

    return nextDate;
  }
}

