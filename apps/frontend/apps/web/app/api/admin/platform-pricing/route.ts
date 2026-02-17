import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';

/**
 * GET /api/admin/platform-pricing
 *
 * Returns the current platform pricing configuration (single row).
 * Admin-only.
 */
export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let pricing = await prisma.platformPricing.findFirst();

    if (!pricing) {
      pricing = await prisma.platformPricing.create({
        data: {
          twilioInboundPerMin: 0.0085,
          twilioOutboundPerMin: 0.014,
          serverCostPerMin: 0.005,
          markupPercent: 30.0,
        },
      });
    }

    return NextResponse.json({
      success: true,
      pricing: {
        id: pricing.id,
        twilioInboundPerMin: pricing.twilioInboundPerMin,
        twilioOutboundPerMin: pricing.twilioOutboundPerMin,
        serverCostPerMin: pricing.serverCostPerMin,
        markupPercent: pricing.markupPercent,
        updatedAt: pricing.updatedAt,
        updatedBy: pricing.updatedBy,
      },
    });
  } catch (error) {
    console.error('[Admin Platform Pricing] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch pricing' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/admin/platform-pricing
 *
 * Update the platform pricing configuration.
 * Admin-only. Expects JSON body with rate fields.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate fields
    const fields = ['twilioInboundPerMin', 'twilioOutboundPerMin', 'serverCostPerMin', 'markupPercent'] as const;
    const updates: Record<string, number> = {};

    for (const field of fields) {
      if (body[field] !== undefined) {
        const val = Number(body[field]);
        if (isNaN(val) || val < 0) {
          return NextResponse.json(
            { error: `Invalid value for ${field}: must be a non-negative number` },
            { status: 400 },
          );
        }
        if (field === 'markupPercent' && val > 100) {
          return NextResponse.json(
            { error: 'Markup percent cannot exceed 100%' },
            { status: 400 },
          );
        }
        updates[field] = val;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 },
      );
    }

    // Ensure a row exists
    let existing = await prisma.platformPricing.findFirst();
    if (!existing) {
      existing = await prisma.platformPricing.create({
        data: {
          twilioInboundPerMin: 0.0085,
          twilioOutboundPerMin: 0.014,
          serverCostPerMin: 0.005,
          markupPercent: 30.0,
        },
      });
    }

    const pricing = await prisma.platformPricing.update({
      where: { id: existing.id },
      data: {
        ...updates,
        updatedBy: session.id,
      },
    });

    console.log('[Admin Platform Pricing] Updated by', session.id, ':', updates);

    return NextResponse.json({
      success: true,
      pricing: {
        id: pricing.id,
        twilioInboundPerMin: pricing.twilioInboundPerMin,
        twilioOutboundPerMin: pricing.twilioOutboundPerMin,
        serverCostPerMin: pricing.serverCostPerMin,
        markupPercent: pricing.markupPercent,
        updatedAt: pricing.updatedAt,
        updatedBy: pricing.updatedBy,
      },
    });
  } catch (error) {
    console.error('[Admin Platform Pricing] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update pricing' },
      { status: 500 },
    );
  }
}
