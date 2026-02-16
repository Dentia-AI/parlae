import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';

/**
 * PUT /api/admin/agent-templates/update
 *
 * Update an existing template's configuration in-place.
 * Use this when pulling updated config from Vapi for the same template version
 * (minor tweaks to prompts, tools, etc.).
 *
 * Body:
 * {
 *   templateId: string;
 *   squadConfig?: object;
 *   assistantConfig?: object;
 *   toolsConfig?: object;
 *   modelConfig?: object;
 *   displayName?: string;
 *   description?: string;
 *   version?: string;        // bump version if desired
 *   bumpVersion?: boolean;   // auto-increment minor version
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionUser();

    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const {
      templateId,
      squadConfig,
      assistantConfig,
      toolsConfig,
      modelConfig,
      displayName,
      description,
      version,
      bumpVersion,
    } = body;

    if (!templateId) {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 },
      );
    }

    const existing = await prisma.agentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 },
      );
    }

    // Build update data — only overwrite fields that were provided
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (squadConfig !== undefined) updateData.squadConfig = squadConfig;
    if (assistantConfig !== undefined) updateData.assistantConfig = assistantConfig;
    if (toolsConfig !== undefined) updateData.toolsConfig = toolsConfig;
    if (modelConfig !== undefined) updateData.modelConfig = modelConfig;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (description !== undefined) updateData.description = description;

    // Handle version
    if (version) {
      updateData.version = version;
      // Also update the name if it's auto-generated (contains old version)
      if (existing.name.includes(existing.version)) {
        updateData.name = existing.name.replace(existing.version, version);
      }
    } else if (bumpVersion) {
      // Auto-bump: v1.0 → v1.1, v2.3 → v2.4
      const parts = existing.version.match(/^(v?)(\d+)\.(\d+)$/);
      if (parts) {
        const newVersion = `${parts[1]}${parts[2]}.${parseInt(parts[3]!) + 1}`;
        updateData.version = newVersion;
        if (existing.name.includes(existing.version)) {
          updateData.name = existing.name.replace(existing.version, newVersion);
        }
      }
    }

    const updated = await prisma.agentTemplate.update({
      where: { id: templateId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      template: updated,
      previousVersion: existing.version,
      newVersion: updated.version,
    });
  } catch (error) {
    console.error('Update template error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update template',
      },
      { status: 500 },
    );
  }
}
