import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@kit/shared/auth/nextauth';
import { prisma } from '@kit/prisma';
import { getLogger } from '@kit/shared/logger';

/**
 * GET /api/stripe/check-payment-method
 * 
 * Check if account has a verified payment method
 */
export async function GET(request: NextRequest) {
  const logger = await getLogger();

  try {
    // Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
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

    // Get account payment verification status
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        primaryOwnerId: session.user.id,
      },
      select: {
        paymentMethodVerified: true,
        paymentMethodVerifiedAt: true,
      },
    });

    if (!account) {
      logger.error(
        { userId: session.user.id, accountId },
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
