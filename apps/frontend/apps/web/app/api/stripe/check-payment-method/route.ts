import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';
import { getEffectiveUserId } from '~/lib/auth/get-session';

/**
 * GET /api/stripe/check-payment-method
 * 
 * Check if account has a verified payment method
 */
export async function GET(request: NextRequest) {
  const logger = await getLogger();

  try {
    const userId = await getEffectiveUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { success: false, message: 'Account ID is required' },
        { status: 400 }
      );
    }

    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        primaryOwnerId: userId,
      },
      select: {
        paymentMethodVerified: true,
        paymentMethodVerifiedAt: true,
      },
    });

    if (!account) {
      logger.error(
        { userId, accountId },
        '[Payment] Account not found or unauthorized'
      );
      return NextResponse.json(
        { success: false, message: 'Account not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      verified: account.paymentMethodVerified,
      verifiedAt: account.paymentMethodVerifiedAt,
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      },
      '[Payment] Exception while checking payment method'
    );

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to check payment method',
      },
      { status: 500 }
    );
  }
}
