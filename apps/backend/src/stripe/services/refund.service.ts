import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { Refund } from '@kit/prisma';

export interface CreateRefundDto {
  paymentId: string;
  amountCents?: number; // If not provided, refund the full amount
  reason?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Create a refund for a payment
   */
  async createRefund(dto: CreateRefundDto): Promise<Refund> {
    const stripe = this.stripeService.getClient();

    try {
      // Get the payment
      const payment = await this.prisma.payment.findUnique({
        where: { id: dto.paymentId },
      });

      if (!payment) {
        throw new NotFoundException(
          `Payment with ID ${dto.paymentId} not found`,
        );
      }

      if (payment.status !== 'SUCCEEDED') {
        throw new Error(
          'Cannot refund a payment that has not been successfully completed',
        );
      }

      if (!payment.stripePaymentIntentId) {
        throw new Error('Payment does not have a Stripe payment intent ID');
      }

      this.logger.log(
        `Creating refund for payment ${payment.id}, amount: ${dto.amountCents || payment.amountCents}`,
      );

      // Create refund in Stripe
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: dto.amountCents || payment.amountCents,
        reason: dto.reason as any,
        metadata: {
          paymentId: payment.id,
          ...(dto.metadata || {}),
        },
      });

      // Create refund record in database
      const refundRecord = await this.prisma.refund.create({
        data: {
          paymentId: payment.id,
          stripeRefundId: refund.id,
          amountCents: refund.amount,
          currency: payment.currency,
          status: this.mapStripeRefundStatus(refund.status || 'pending'),
          reason: dto.reason,
          metadata: dto.metadata,
        },
      });

      // Update payment status if fully refunded
      const totalRefunded = await this.getTotalRefundedAmount(payment.id);
      if (totalRefunded >= payment.amountCents) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED' },
        });
      }

      this.logger.log(
        `Refund ${refundRecord.id} created for payment ${payment.id}`,
      );

      return refundRecord;
    } catch (error) {
      this.logger.error(
        `Failed to create refund: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Process refund webhook from Stripe
   */
  async processRefundUpdate(refundId: string, status: string): Promise<void> {
    try {
      const refund = await this.prisma.refund.findFirst({
        where: { stripeRefundId: refundId },
      });

      if (!refund) {
        this.logger.warn(`Refund not found for Stripe refund: ${refundId}`);
        return;
      }

      await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: this.mapStripeRefundStatus(status),
        },
      });

      this.logger.log(`Refund ${refund.id} status updated to ${status}`);
    } catch (error) {
      this.logger.error(
        `Failed to process refund update: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get refund by ID
   */
  async getRefundById(refundId: string): Promise<Refund | null> {
    return this.prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        payment: {
          include: {
            user: true,
            account: true,
          },
        },
      },
    }) as any;
  }

  /**
   * Get refunds for a payment
   */
  async getPaymentRefunds(paymentId: string): Promise<Refund[]> {
    return this.prisma.refund.findMany({
      where: { paymentId },
      orderBy: { createdAt: 'desc' },
    }) as any;
  }

  /**
   * Get total refunded amount for a payment
   */
  async getTotalRefundedAmount(paymentId: string): Promise<number> {
    const refunds = await this.prisma.refund.findMany({
      where: {
        paymentId,
        status: { in: ['SUCCEEDED', 'PENDING'] },
      },
    });

    return refunds.reduce(
      (total, refund) => total + refund.amountCents,
      0,
    );
  }

  /**
   * Map Stripe refund status to our enum
   */
  private mapStripeRefundStatus(
    stripeStatus: string,
  ): 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' {
    const statusMap: Record<string, any> = {
      pending: 'PENDING',
      succeeded: 'SUCCEEDED',
      failed: 'FAILED',
      canceled: 'CANCELED',
    };
    return statusMap[stripeStatus] || 'PENDING';
  }
}

