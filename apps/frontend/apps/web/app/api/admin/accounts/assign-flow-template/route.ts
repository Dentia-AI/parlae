import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';

/**
 * POST /api/admin/accounts/assign-flow-template
 *
 * Assign a Retell conversation flow template to an account.
 * Body: { accountId: string, flowTemplateId: string }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { accountId, flowTemplateId } = body;

    if (!accountId || !flowTemplateId) {
      return NextResponse.json(
        { error: 'accountId and flowTemplateId are required' },
        { status: 400 },
      );
    }

    const template = await prisma.retellConversationFlowTemplate.findUnique({
      where: { id: flowTemplateId },
      select: { id: true, name: true, displayName: true, version: true },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Flow template not found' },
        { status: 404 },
      );
    }

    await prisma.account.update({
      where: { id: accountId },
      data: { retellFlowTemplateId: flowTemplateId },
    });

    return NextResponse.json({
      success: true,
      account: { id: accountId },
      template,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to assign flow template' },
      { status: 500 },
    );
  }
}
