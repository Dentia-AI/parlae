import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe.service';

@Injectable()
export class RecurringBillingService {
  private readonly logger = new Logger(RecurringBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Process recurring payments - runs daily at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async processRecurringPayments(): Promise<void> {
    this.logger.log('Starting recurring payment processing...');

    try {
      const stripe = this.stripeService.getClient();

      // Get all payments that are due for billing today
      const duePayments = await this.prisma.payment.findMany({
        where: {
          isRecurring: true,
          status: 'SUCCEEDED',
          nextBillingDate: {
            lte: new Date(),
          },
        },
        include: {
          user: true,
          account: true,
        },
      });

      this.logger.log(`Found ${duePayments.length} payments due for billing`);

      for (const payment of duePayments) {
        try {
          // Get or create Stripe customer
          const customer = await this.getOrCreateCustomer(
            payment.user.email,
            payment.userId,
          );

          // Create payment intent for the recurring payment
          const paymentIntent = await stripe.paymentIntents.create({
            amount: payment.amountCents,
            currency: payment.currency,
            customer: customer.id,
            description: `Recurring payment for ${payment.amountCents / 100} ${payment.currency.toUpperCase()}`,
            metadata: {
              paymentId: payment.id,
              userId: payment.userId,
              accountId: payment.accountId || '',
              recurringPayment: 'true',
            },
            // Use saved payment method if available
            payment_method: await this.getCustomerDefaultPaymentMethod(
              customer.id,
            ),
            off_session: true,
            confirm: true,
          });

          if (paymentIntent.status === 'succeeded') {
            // Update payment record
            const nextBillingDate = this.calculateNextBillingDate(
              new Date(),
              payment.recurringInterval!,
              payment.recurringFrequency || 1,
            );

            await this.prisma.payment.update({
              where: { id: payment.id },
              data: {
                lastBillingDate: new Date(),
                nextBillingDate,
                failureCount: 0,
                failureReason: null,
              },
            });

            this.logger.log(
              `Successfully billed recurring payment ${payment.id}`,
            );
          } else {
            await this.handleRecurringPaymentFailure(
              payment.id,
              'Payment intent not succeeded',
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to process recurring payment ${payment.id}: ${error.message}`,
            error.stack,
          );
          await this.handleRecurringPaymentFailure(payment.id, error.message);
        }
      }

      this.logger.log('Recurring payment processing completed');
    } catch (error) {
      this.logger.error(
        `Error in recurring payment processing: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Get or create Stripe customer
   */
  private async getOrCreateCustomer(
    email: string,
    userId: string,
  ): Promise<any> {
    const stripe = this.stripeService.getClient();

    // Check if customer already exists
    const customers = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (customers.data.length > 0) {
      return customers.data[0];
    }

    // Create new customer
    return stripe.customers.create({
      email,
      metadata: {
        userId,
      },
    });
  }

  /**
   * Get customer's default payment method
   */
  private async getCustomerDefaultPaymentMethod(
    customerId: string,
  ): Promise<string | undefined> {
    const stripe = this.stripeService.getClient();

    const customer = await stripe.customers.retrieve(customerId);

    if ('invoice_settings' in customer && customer.invoice_settings) {
      return customer.invoice_settings.default_payment_method as
        | string
        | undefined;
    }

    // Fall back to listing payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });

    return paymentMethods.data[0]?.id;
  }

  /**
   * Handle recurring payment failure
   */
  private async handleRecurringPaymentFailure(
    paymentId: string,
    reason: string,
  ): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return;
    }

    const failureCount = payment.failureCount + 1;

    // If failed 3 times, cancel the recurring payment
    if (failureCount >= 3) {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'FAILED',
          failureCount,
          failureReason: reason,
          isRecurring: false, // Stop trying to charge
        },
      });

      this.logger.error(
        `Recurring payment ${paymentId} canceled after 3 failures`,
      );

      // TODO: Send notification to user about failed recurring payment
    } else {
      // Increment failure count and try again next cycle
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          failureCount,
          failureReason: reason,
        },
      });

      this.logger.warn(
        `Recurring payment ${paymentId} failed (attempt ${failureCount}/3)`,
      );
    }
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

