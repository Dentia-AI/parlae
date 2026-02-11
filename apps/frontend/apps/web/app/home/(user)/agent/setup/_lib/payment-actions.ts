'use server';

import { enhanceAction } from '@kit/next/actions';
import { z } from 'zod';
import Stripe from 'stripe';

/**
 * @name createSetupIntent
 * @description Creates a Stripe SetupIntent for collecting payment method
 */
export const createSetupIntent = enhanceAction(
  async function () {
    try {
      const secretKey = process.env.STRIPE_SECRET_KEY;
      
      if (!secretKey) {
        throw new Error('Stripe secret key not configured');
      }

      const stripe = new Stripe(secretKey, {
        apiVersion: '2024-12-18.acacia',
      });

      // Create a SetupIntent
      const setupIntent = await stripe.setupIntents.create({
        payment_method_types: ['card'],
        usage: 'off_session',
        // In production, you would add:
        // customer: customerId,
        // metadata: { userId: user.id }
      });

      console.log('SetupIntent created:', setupIntent.id);

      return {
        clientSecret: setupIntent.client_secret,
        success: true,
      };
    } catch (error) {
      console.error('Error creating SetupIntent:', error);
      throw new Error('Failed to initialize payment setup');
    }
  },
  {
    auth: false, // Set to true in production after adding user lookup
  },
);

/**
 * @name confirmPaymentMethod
 * @description Confirms the payment method has been added
 */
export const confirmPaymentMethod = enhanceAction(
  async function (data) {
    // This is a placeholder implementation
    // In production, you would:
    // 1. Verify the payment method was attached
    // 2. Update user's billing status in database
    // 3. Enable deployment capability
    
    return {
      success: true,
      message: 'Payment method added successfully',
    };
  },
  {
    auth: true,
    schema: z.object({
      paymentMethodId: z.string(),
    }),
  },
);
