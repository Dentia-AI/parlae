import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { PaymentService } from './payment.service';
import { RefundService } from './refund.service';
import Stripe from 'stripe';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly paymentService: PaymentService,
    private readonly refundService: RefundService,
  ) {}

  /**
   * Construct and verify Stripe webhook event
   */
  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    const stripe = this.stripeService.getClient();
    const webhookSecret = this.stripeService.getWebhookSecret();

    try {
      return stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch (error) {
      this.logger.error(`Webhook signature verification failed: ${error.message}`);
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  /**
   * Handle webhook event
   */
  async handleEvent(event: Stripe.Event): Promise<void> {
    this.logger.log(`Handling webhook event: ${event.type}`);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(
            event.data.object as Stripe.Checkout.Session,
          );
          break;

        case 'checkout.session.async_payment_succeeded':
          await this.handleAsyncPaymentSucceeded(
            event.data.object as Stripe.Checkout.Session,
          );
          break;

        case 'checkout.session.async_payment_failed':
          await this.handleAsyncPaymentFailed(
            event.data.object as Stripe.Checkout.Session,
          );
          break;

        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(
            event.data.object as Stripe.PaymentIntent,
          );
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(
            event.data.object as Stripe.PaymentIntent,
          );
          break;

        case 'charge.refunded':
          await this.handleChargeRefunded(
            event.data.object as Stripe.Charge,
          );
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(
            event.data.object as Stripe.Invoice,
          );
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(
            event.data.object as Stripe.Invoice,
          );
          break;

        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(
        `Error handling webhook event ${event.type}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Handle checkout session completed
   */
  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    this.logger.log(`Checkout session completed: ${session.id}`);

    if (session.payment_status === 'paid' && session.payment_intent) {
      await this.paymentService.processSuccessfulPayment(
        session.id,
        session.payment_intent as string,
      );
    }
  }

  /**
   * Handle async payment succeeded
   */
  private async handleAsyncPaymentSucceeded(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    this.logger.log(`Async payment succeeded: ${session.id}`);

    if (session.payment_intent) {
      await this.paymentService.processSuccessfulPayment(
        session.id,
        session.payment_intent as string,
      );
    }
  }

  /**
   * Handle async payment failed
   */
  private async handleAsyncPaymentFailed(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    this.logger.log(`Async payment failed: ${session.id}`);

    await this.paymentService.processFailedPayment(
      session.id,
      'Async payment failed',
    );
  }

  /**
   * Handle payment intent succeeded
   */
  private async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.log(`Payment intent succeeded: ${paymentIntent.id}`);
    // Additional logic if needed
  }

  /**
   * Handle payment intent failed
   */
  private async handlePaymentIntentFailed(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.log(`Payment intent failed: ${paymentIntent.id}`);

    const failureMessage =
      paymentIntent.last_payment_error?.message || 'Payment failed';

    // Find payment by payment intent and mark as failed
    // Note: This might need to be adjusted based on your payment tracking
    this.logger.warn(
      `Payment intent ${paymentIntent.id} failed: ${failureMessage}`,
    );
  }

  /**
   * Handle charge refunded
   */
  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    this.logger.log(`Charge refunded: ${charge.id}`);

    if (charge.refunds && charge.refunds.data.length > 0) {
      for (const refund of charge.refunds.data) {
        await this.refundService.processRefundUpdate(refund.id, refund.status || 'pending');
      }
    }
  }

  /**
   * Handle invoice payment succeeded (for recurring payments)
   */
  private async handleInvoicePaymentSucceeded(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    this.logger.log(`Invoice payment succeeded: ${invoice.id}`);

    // This is for recurring subscriptions
    // You can add custom logic here to track recurring payments
    const subscriptionId = typeof (invoice as any).subscription === 'string' 
      ? (invoice as any).subscription 
      : (invoice as any).subscription?.id;
    
    if (subscriptionId) {
      this.logger.log(
        `Recurring payment succeeded for subscription: ${subscriptionId}`,
      );
    }
  }

  /**
   * Handle invoice payment failed (for recurring payments)
   */
  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    this.logger.log(`Invoice payment failed: ${invoice.id}`);

    // This is for recurring subscriptions
    // You can add custom logic here to handle failed recurring payments
    const subscriptionId = typeof (invoice as any).subscription === 'string' 
      ? (invoice as any).subscription 
      : (invoice as any).subscription?.id;
    
    if (subscriptionId) {
      this.logger.error(
        `Recurring payment failed for subscription: ${subscriptionId}`,
      );
      // Add notification logic or retry logic here
    }
  }
}

