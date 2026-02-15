import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { z } from 'zod';

// Get session user ID helper
async function getSessionUserId() {
  try {
    const { getUser } = await import('~/lib/auth/get-session');
    const user = await getUser();
    return user?.id || null;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

// Validation schema
const brandingSchema = z.object({
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  businessName: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
});

/**
 * GET /api/account/branding
 * Get current branding settings
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's personal account
    const account = await prisma.account.findFirst({
      where: {
        primaryOwnerId: userId,
        isPersonalAccount: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        brandingLogoUrl: true,
        brandingPrimaryColor: true,
        brandingBusinessName: true,
        brandingContactEmail: true,
        brandingContactPhone: true,
        brandingAddress: true,
        brandingWebsite: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      branding: account,
    });
  } catch (error) {
    console.error('Error fetching branding:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/account/branding
 * Update branding settings
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = brandingSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid data', 
          details: validation.error.errors 
        },
        { status: 400 }
      );
    }

    const brandingData = validation.data;

    // Get user's personal account
    const account = await prisma.account.findFirst({
      where: {
        primaryOwnerId: userId,
        isPersonalAccount: true,
      },
      select: {
        id: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Update branding
    await prisma.account.update({
      where: { id: account.id },
      data: {
        brandingLogoUrl: brandingData.logoUrl || null,
        brandingPrimaryColor: brandingData.primaryColor || null,
        brandingBusinessName: brandingData.businessName || null,
        brandingContactEmail: brandingData.contactEmail || null,
        brandingContactPhone: brandingData.contactPhone || null,
        brandingAddress: brandingData.address || null,
        brandingWebsite: brandingData.website || null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Branding settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating branding:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
