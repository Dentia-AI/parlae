import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@kit/shared/auth';
import { isAdminUser } from '~/lib/auth/admin';
import { prisma } from '@kit/prisma';
import axios from 'axios';

const SIKKA_BASE_URL = 'https://api.sikkasoft.com/v4';

/**
 * GET /api/admin/pms
 * List all PMS integrations with their status
 */
export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const integrations = await prisma.pmsIntegration.findMany({
      include: {
        account: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const safe = integrations.map((i) => ({
      id: i.id,
      accountId: i.accountId,
      accountName: i.account.name,
      accountSlug: i.account.slug,
      provider: i.provider,
      status: i.status,
      masterCustomerId: i.masterCustomerId,
      practiceKey: i.practiceKey,
      officeId: i.officeId,
      hasRequestKey: Boolean(i.requestKey),
      hasRefreshKey: Boolean(i.refreshKey),
      hasSecretKey: Boolean(i.secretKey),
      tokenExpiry: i.tokenExpiry,
      lastSyncAt: i.lastSyncAt,
      lastError: i.lastError,
      features: i.features,
      config: i.config,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    const envCheck = {
      hasSikkaAppId: Boolean(process.env.SIKKA_APP_ID && process.env.SIKKA_APP_ID !== 'your_sikka_app_id_here'),
      hasSikkaAppKey: Boolean(process.env.SIKKA_APP_KEY && process.env.SIKKA_APP_KEY !== 'your_sikka_app_key_here'),
    };

    return NextResponse.json({
      success: true,
      integrations: safe,
      envCheck,
    });
  } catch (error) {
    console.error('[Admin PMS] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list integrations' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/pms
 * Create a new PMS integration or activate token
 *
 * Actions:
 * - action: "create" -- Insert a new PMS integration row
 * - action: "activate" -- Get initial request_key from Sikka
 * - action: "test" -- Test the connection by fetching practices
 * - action: "fetch-patients" -- Fetch sample patients
 * - action: "fetch-appointments" -- Fetch sample appointments
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !isAdminUser(session.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'create':
        return handleCreate(body);
      case 'activate':
        return handleActivate(body);
      case 'test':
        return handleTest(body);
      case 'fetch-patients':
        return handleFetchPatients(body);
      case 'fetch-appointments':
        return handleFetchAppointments(body);
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[Admin PMS] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

async function handleCreate(body: any) {
  const { accountId, masterCustomerId, practiceKey, practiceId, spuInstallationKey } = body;

  if (!accountId || !practiceKey || !spuInstallationKey) {
    return NextResponse.json(
      { error: 'accountId, practiceKey, and spuInstallationKey are required' },
      { status: 400 },
    );
  }

  // Check if integration already exists
  const existing = await prisma.pmsIntegration.findUnique({
    where: { accountId_provider: { accountId, provider: 'SIKKA' } },
  });

  if (existing) {
    // Update existing
    const updated = await prisma.pmsIntegration.update({
      where: { id: existing.id },
      data: {
        masterCustomerId: masterCustomerId || existing.masterCustomerId,
        practiceKey,
        spuInstallationKey,
        officeId: practiceId || existing.officeId,
        secretKey: spuInstallationKey,
        status: 'SETUP_REQUIRED',
        lastError: null,
        features: {
          appointments: true,
          patients: true,
          insurance: true,
          payments: true,
        },
        config: {
          defaultAppointmentDuration: 30,
          timezone: 'America/Toronto',
        },
        metadata: {
          masterCustomerId: masterCustomerId || null,
          practiceId: practiceId || null,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'PMS integration updated',
      integration: { id: updated.id, status: updated.status },
    });
  }

  const integration = await prisma.pmsIntegration.create({
    data: {
      accountId,
      provider: 'SIKKA',
      status: 'SETUP_REQUIRED',
      masterCustomerId: masterCustomerId || null,
      practiceKey,
      spuInstallationKey,
      officeId: practiceId || null,
      secretKey: spuInstallationKey,
      features: {
        appointments: true,
        patients: true,
        insurance: true,
        payments: true,
      },
      config: {
        defaultAppointmentDuration: 30,
        timezone: 'America/Toronto',
      },
      metadata: {
        masterCustomerId: masterCustomerId || null,
        practiceId: practiceId || null,
      },
    },
  });

  return NextResponse.json({
    success: true,
    message: 'PMS integration created',
    integration: { id: integration.id, status: integration.status },
  });
}

async function handleActivate(body: any) {
  const { integrationId } = body;

  if (!integrationId) {
    return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
  }

  const appId = process.env.SIKKA_APP_ID;
  const appKey = process.env.SIKKA_APP_KEY;

  if (!appId || !appKey || appId === 'your_sikka_app_id_here') {
    return NextResponse.json(
      {
        error: 'SIKKA_APP_ID and SIKKA_APP_KEY environment variables are not configured. Set them in .env.local or SSM.',
        envCheck: {
          SIKKA_APP_ID: appId ? '(set but may be placeholder)' : '(missing)',
          SIKKA_APP_KEY: appKey ? '(set but may be placeholder)' : '(missing)',
        },
      },
      { status: 500 },
    );
  }

  const integration = await prisma.pmsIntegration.findUnique({
    where: { id: integrationId },
  });

  if (!integration) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  }

  const officeId = integration.officeId;
  const secretKey = integration.secretKey;

  if (!officeId || !secretKey) {
    return NextResponse.json(
      { error: `Missing officeId (${officeId}) or secretKey (${secretKey ? 'set' : 'missing'}) on integration` },
      { status: 400 },
    );
  }

  console.log(`[Admin PMS] Activating token for integration ${integrationId}, officeId=${officeId}`);

  try {
    const response = await axios.post(
      `${SIKKA_BASE_URL}/request_key`,
      {
        grant_type: 'request_key',
        office_id: officeId,
        secret_key: secretKey,
        app_id: appId,
        app_key: appKey,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 },
    );

    const data = response.data;

    if (!data.request_key || !data.refresh_key) {
      return NextResponse.json(
        { error: 'Sikka API returned invalid response (no request_key)', rawResponse: data },
        { status: 502 },
      );
    }

    const expiresInStr = data.expires_in || '86400 second(s)';
    const expiresIn = parseInt(expiresInStr) || 86400;
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

    await prisma.pmsIntegration.update({
      where: { id: integrationId },
      data: {
        requestKey: data.request_key,
        refreshKey: data.refresh_key,
        tokenExpiry,
        status: 'ACTIVE',
        lastError: null,
      },
    });

    console.log(`[Admin PMS] Token activated for ${integrationId}, expires at ${tokenExpiry.toISOString()}`);

    return NextResponse.json({
      success: true,
      message: 'Token activated successfully',
      tokenExpiry: tokenExpiry.toISOString(),
      expiresIn: `${expiresIn} seconds`,
    });
  } catch (error: any) {
    const errMsg = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    await prisma.pmsIntegration.update({
      where: { id: integrationId },
      data: {
        status: 'ERROR',
        lastError: `Token activation failed: ${errMsg}`,
      },
    });

    return NextResponse.json(
      { error: `Sikka token activation failed: ${errMsg}` },
      { status: 502 },
    );
  }
}

async function handleTest(body: any) {
  const { integrationId } = body;

  if (!integrationId) {
    return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
  }

  const integration = await prisma.pmsIntegration.findUnique({
    where: { id: integrationId },
  });

  if (!integration || !integration.requestKey) {
    return NextResponse.json(
      { error: 'Integration not found or token not activated. Activate the token first.' },
      { status: 400 },
    );
  }

  try {
    // Test by fetching authorized_practices
    const response = await axios.get(`${SIKKA_BASE_URL}/authorized_practices`, {
      headers: {
        Authorization: `Bearer ${integration.requestKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    return NextResponse.json({
      success: true,
      message: 'Connection test successful',
      practices: response.data,
    });
  } catch (error: any) {
    const errMsg = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    return NextResponse.json(
      { error: `Connection test failed: ${errMsg}`, statusCode: error.response?.status },
      { status: 502 },
    );
  }
}

async function handleFetchPatients(body: any) {
  const { integrationId } = body;

  if (!integrationId) {
    return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
  }

  const integration = await prisma.pmsIntegration.findUnique({
    where: { id: integrationId },
  });

  if (!integration || !integration.requestKey) {
    return NextResponse.json({ error: 'Token not activated' }, { status: 400 });
  }

  try {
    const response = await axios.get(`${SIKKA_BASE_URL}/patients`, {
      headers: {
        Authorization: `Bearer ${integration.requestKey}`,
        'Content-Type': 'application/json',
      },
      params: { limit: 10, offset: 0 },
      timeout: 15000,
    });

    await prisma.pmsIntegration.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      count: Array.isArray(response.data) ? response.data.length : (response.data?.data?.length ?? 0),
      patients: response.data,
    });
  } catch (error: any) {
    const errMsg = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    return NextResponse.json(
      { error: `Failed to fetch patients: ${errMsg}` },
      { status: 502 },
    );
  }
}

async function handleFetchAppointments(body: any) {
  const { integrationId } = body;

  if (!integrationId) {
    return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
  }

  const integration = await prisma.pmsIntegration.findUnique({
    where: { id: integrationId },
  });

  if (!integration || !integration.requestKey) {
    return NextResponse.json({ error: 'Token not activated' }, { status: 400 });
  }

  try {
    // Fetch today's and upcoming appointments
    const today = new Date().toISOString().split('T')[0];
    const response = await axios.get(`${SIKKA_BASE_URL}/appointments`, {
      headers: {
        Authorization: `Bearer ${integration.requestKey}`,
        'Content-Type': 'application/json',
      },
      params: { limit: 10, offset: 0, start_date: today },
      timeout: 15000,
    });

    await prisma.pmsIntegration.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      count: Array.isArray(response.data) ? response.data.length : (response.data?.data?.length ?? 0),
      appointments: response.data,
    });
  } catch (error: any) {
    const errMsg = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    return NextResponse.json(
      { error: `Failed to fetch appointments: ${errMsg}` },
      { status: 502 },
    );
  }
}
