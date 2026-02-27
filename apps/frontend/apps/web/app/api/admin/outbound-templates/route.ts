import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/auth/is-admin';
import { prisma } from '@kit/prisma';

export async function GET() {
  try {
    await requireAdmin();

    const templates = await prisma.outboundAgentTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const accountVersionCounts = await prisma.outboundSettings.groupBy({
      by: ['outboundTemplateVersion'],
      _count: { id: true },
      where: {
        OR: [
          { patientCareEnabled: true },
          { financialEnabled: true },
        ],
      },
    });

    const versionDistribution: Record<string, number> = {};
    for (const row of accountVersionCounts) {
      const ver = row.outboundTemplateVersion || 'unknown';
      versionDistribution[ver] = (versionDistribution[ver] || 0) + row._count.id;
    }

    const patientCareCount = await prisma.outboundSettings.count({
      where: { patientCareEnabled: true, patientCareRetellAgentId: { not: null } },
    });
    const financialCount = await prisma.outboundSettings.count({
      where: { financialEnabled: true, financialRetellAgentId: { not: null } },
    });

    return NextResponse.json({
      templates,
      versionDistribution,
      activeAccounts: { patientCare: patientCareCount, financial: financialCount },
    });
  } catch (error) {
    console.error('[admin/outbound-templates] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch templates' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();

    if (body.fromBuiltIn) {
      const { seedOutboundTemplates } = await import(
        '@kit/shared/retell/templates/outbound/outbound-template-seed'
      );
      const ids = await seedOutboundTemplates(prisma);
      return NextResponse.json({
        success: true,
        ...ids,
        message: 'Outbound templates seeded from built-in prompts',
      });
    }

    const { agentGroup, name, flowConfig, promptTemplates, voicemailMessages, version } = body;

    if (!agentGroup || !name || !['PATIENT_CARE', 'FINANCIAL'].includes(agentGroup)) {
      return NextResponse.json(
        { error: 'agentGroup (PATIENT_CARE or FINANCIAL) and name are required' },
        { status: 400 },
      );
    }

    const existing = await prisma.outboundAgentTemplate.findUnique({
      where: { agentGroup },
    });

    if (existing) {
      const updated = await prisma.outboundAgentTemplate.update({
        where: { agentGroup },
        data: {
          name,
          flowConfig: flowConfig || existing.flowConfig,
          promptTemplates: promptTemplates || existing.promptTemplates,
          voicemailMessages: voicemailMessages || existing.voicemailMessages,
          version: version || existing.version,
        },
      });
      return NextResponse.json({ template: updated, action: 'updated' });
    }

    const created = await prisma.outboundAgentTemplate.create({
      data: {
        agentGroup,
        name,
        flowConfig: flowConfig || {},
        promptTemplates: promptTemplates || {},
        voicemailMessages: voicemailMessages || {},
        version: version || 'v1.0',
      },
    });

    return NextResponse.json({ template: created, action: 'created' });
  } catch (error) {
    console.error('[admin/outbound-templates] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create template' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { id, name, promptTemplates, voicemailMessages, flowConfig, smsTemplates, emailTemplates, version, bumpVersion } = body;

    if (!id) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
    }

    const existing = await prisma.outboundAgentTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (promptTemplates !== undefined) updateData.promptTemplates = promptTemplates;
    if (voicemailMessages !== undefined) updateData.voicemailMessages = voicemailMessages;
    if (flowConfig !== undefined) updateData.flowConfig = flowConfig;
    if (smsTemplates !== undefined) updateData.smsTemplates = smsTemplates;
    if (emailTemplates !== undefined) updateData.emailTemplates = emailTemplates;

    if (bumpVersion) {
      const parts = existing.version.match(/^v(\d+)\.(\d+)$/);
      if (parts) {
        const major = parseInt(parts[1]!, 10);
        const minor = parseInt(parts[2]!, 10);
        updateData.version = `v${major}.${minor + 1}`;
      } else {
        updateData.version = `${existing.version}.1`;
      }
    } else if (version !== undefined) {
      updateData.version = version;
    }

    const updated = await prisma.outboundAgentTemplate.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ template: updated });
  } catch (error) {
    console.error('[admin/outbound-templates] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update template' },
      { status: 500 },
    );
  }
}
