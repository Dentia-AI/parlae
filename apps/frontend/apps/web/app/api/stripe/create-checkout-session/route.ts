import { NextResponse } from 'next/server';
import { enhanceRouteHandler } from '@kit/next/routes';
import { z } from 'zod';

const CreateCheckoutSessionSchema = z.object({
  userId: z.string(),
  accountId: z.string().optional(),
  amountCents: z.number().int().positive(),
  currency: z.string().default('usd'),
  paymentType: z.enum(['ONE_TIME', 'RECURRING']),
  isRecurring: z.boolean().default(false),
  recurringInterval: z
    .enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])
    .optional(),
  recurringFrequency: z.number().int().positive().optional(),
  customerEmail: z.string().email(),
  returnUrl: z.string().url(),
  metadata: z.record(z.any()).optional(),
});

export const POST = enhanceRouteHandler(
  async ({ body, request }) => {
    const backendUrl =
      process.env.BACKEND_API_URL || 'http://localhost:4000';

    // Get auth token from request
    const authHeader = request.headers.get('authorization');

    // Forward request to backend
    const response = await fetch(
      `${backendUrl}/stripe/create-checkout-session`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || 'Failed to create checkout session' },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  },
  {
    auth: false,
    schema: CreateCheckoutSessionSchema,
  },
);

