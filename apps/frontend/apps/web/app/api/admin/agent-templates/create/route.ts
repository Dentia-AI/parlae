import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSessionUser();
    
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      name,
      displayName,
      description,
      version,
      category,
      isDefault,
      squadConfig,
      assistantConfig,
      toolsConfig,
      modelConfig,
    } = body;

    // Validate required fields
    if (!name || !displayName || !version || !category) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if name already exists
    const existing = await prisma.agentTemplate.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Template with this name already exists' },
        { status: 409 }
      );
    }

    // If setting as default, unset other defaults in same category
    if (isDefault) {
      await prisma.agentTemplate.updateMany({
        where: {
          category,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Create template
    const template = await prisma.agentTemplate.create({
      data: {
        name,
        displayName,
        description: description || null,
        version,
        category,
        isDefault: isDefault || false,
        squadConfig,
        assistantConfig,
        toolsConfig: toolsConfig || null,
        modelConfig,
      },
    });

    return NextResponse.json({
      success: true,
      template,
    });
  } catch (error) {
    console.error('Create template error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create template' },
      { status: 500 }
    );
  }
}
