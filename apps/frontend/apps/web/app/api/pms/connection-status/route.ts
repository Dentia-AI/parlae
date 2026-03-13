import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';
import { getSessionUser } from '@kit/shared/auth';

const SIKKA_BASE_URL = 'https://api.sikkasoft.com/v4';

/**
 * GET /api/pms/connection-status?accountId=xxx
 *
 * Verifies the PMS integration is actually working by calling the Sikka API:
 * 1. Reads credentials from the pms_integrations DB record
 * 2. Calls Sikka /v4/request_key to verify office_id + secret_key are valid
 * 3. Calls /v4/authorized_practices to get the actual PMS name
 * 4. Updates the DB record with fresh tokens and metadata
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json(
        { isConnected: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const accountId = request.nextUrl.searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { isConnected: false, error: 'Missing accountId parameter' },
        { status: 400 },
      );
    }

    // Verify the requested account belongs to this user
    const requestedAccount = await prisma.account.findFirst({
      where: { id: accountId, primaryOwnerId: session.id },
      select: { id: true },
    });

    if (!requestedAccount) {
      return NextResponse.json(
        { isConnected: false, error: 'Account not found' },
        { status: 404 },
      );
    }

    // Find PMS integration across all accounts owned by this user
    const allUserAccounts = await prisma.account.findMany({
      where: { primaryOwnerId: session.id },
      select: { id: true },
    });
    const allAccountIds = allUserAccounts.map((a) => a.id);

    let pmsIntegration: any = null;
    try {
      pmsIntegration = await prisma.pmsIntegration.findFirst({
        where: { accountId: { in: allAccountIds } },
        orderBy: { updatedAt: 'desc' },
      });
    } catch {
      // Table may not exist yet
    }

    if (!pmsIntegration) {
      return NextResponse.json({
        isConnected: false,
        status: 'not_configured',
        provider: null,
      });
    }

    const appId = process.env.SIKKA_APP_ID;
    const appKey = process.env.SIKKA_APP_KEY;

    if (!appId || !appKey) {
      return NextResponse.json({
        isConnected: false,
        status: 'missing_config',
        error: 'Sikka system credentials not configured',
      });
    }

    // If office_id/secret_key are missing but we have a masterCustomerId,
    // try to fetch them from Sikka authorized_practices (auto-upgrade flow).
    let officeId = pmsIntegration.officeId;
    let secretKey = pmsIntegration.secretKey;

    if ((!officeId || !secretKey) && pmsIntegration.masterCustomerId) {
      try {
        const practicesRes = await fetch(`${SIKKA_BASE_URL}/authorized_practices`, {
          method: 'GET',
          headers: { 'App-Id': appId, 'App-Key': appKey },
        });

        if (practicesRes.ok) {
          const practicesData = await practicesRes.json();
          const practices = practicesData.items || practicesData || [];
          const practicesList = Array.isArray(practices) ? practices : [];

          console.log('[PMS Check] authorized_practices returned', practicesList.length, 'practices for masterCustomerId', pmsIntegration.masterCustomerId);
          if (practicesList.length > 0) {
            console.log('[PMS Check] Practice IDs:', practicesList.map((p: any) => ({
              customer_id: p.customer_id,
              office_id: p.office_id,
              practice_name: p.practice_name,
            })));
          }

          const mcid = String(pmsIntegration.masterCustomerId);
          const matched =
            practicesList.find((p: any) => String(p.customer_id) === mcid) ||
            practicesList.find((p: any) => String(p.office_id) === mcid) ||
            (practicesList.length > 0 ? practicesList[practicesList.length - 1] : null);

          if (matched?.office_id && matched?.secret_key) {
            officeId = matched.office_id;
            secretKey = matched.secret_key;

            const meta = (pmsIntegration.metadata as any) || {};
            await prisma.pmsIntegration.update({
              where: { id: pmsIntegration.id },
              data: {
                officeId,
                secretKey,
                metadata: {
                  ...meta,
                  practiceName: matched.practice_name || meta.practiceName,
                  actualPmsType: matched.practice_management_system || meta.actualPmsType,
                  practiceId: matched.practice_id || meta.practiceId,
                },
                updatedAt: new Date(),
              },
            });
            console.log('[PMS Check] Auto-discovered credentials for', pmsIntegration.masterCustomerId, '-> office_id:', officeId);
          } else {
            console.warn('[PMS Check] No matching practice with credentials found. Matched:', matched);
          }
        } else {
          console.error('[PMS Check] authorized_practices returned status', practicesRes.status, await practicesRes.text().catch(() => ''));
        }
      } catch (err) {
        console.error('[PMS Check] Failed to fetch authorized_practices for auto-upgrade:', err);
      }
    }

    if (!officeId || !secretKey) {
      return NextResponse.json({
        isConnected: false,
        status: 'missing_credentials',
        error: 'PMS credentials not yet available — Sikka may still be processing the registration. Please try again in a few minutes.',
      });
    }

    // Call Sikka /v4/request_key to verify credentials are live
    let requestKey: string | null = null;
    let refreshKey: string | null = null;
    let tokenExpiry: Date | null = null;

    try {
      const tokenResponse = await fetch(`${SIKKA_BASE_URL}/request_key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'request_key',
          office_id: officeId,
          secret_key: secretKey,
          app_id: appId,
          app_key: appKey,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('[PMS Check] Sikka token request failed:', tokenResponse.status, errorText);

        // Update DB to reflect error
        await prisma.pmsIntegration.update({
          where: { id: pmsIntegration.id },
          data: {
            status: 'ERROR',
            lastError: `Token request failed (${tokenResponse.status}): ${errorText.slice(0, 200)}`,
            updatedAt: new Date(),
          },
        });

        return NextResponse.json({
          isConnected: false,
          status: 'error',
          error: `Sikka API returned ${tokenResponse.status} — credentials may be invalid or expired`,
        });
      }

      const tokenData = await tokenResponse.json();
      requestKey = tokenData.request_key;
      refreshKey = tokenData.refresh_key;
      const expiresIn = parseInt(tokenData.expires_in) || 86400;
      tokenExpiry = new Date(Date.now() + expiresIn * 1000);
    } catch (err) {
      console.error('[PMS Check] Network error calling Sikka:', err);
      return NextResponse.json({
        isConnected: false,
        status: 'error',
        error: 'Could not reach Sikka API — network error',
      });
    }

    // Call /v4/authorized_practices to get actual PMS name
    let practiceName: string | null = null;
    let actualPmsType: string | null = null;

    try {
      const practicesResponse = await fetch(`${SIKKA_BASE_URL}/authorized_practices`, {
        method: 'GET',
        headers: {
          'App-Id': appId,
          'App-Key': appKey,
        },
      });

      if (practicesResponse.ok) {
        const practicesData = await practicesResponse.json();
        const practices = practicesData.items || [];
        // Find the matching practice by office_id
        const matchedPractice = practices.find(
          (p: any) => p.office_id === officeId,
        ) || practices[0];
        if (matchedPractice) {
          practiceName = matchedPractice.practice_name || null;
          actualPmsType = matchedPractice.practice_management_system || null;
        }
      }
    } catch {
      // Non-critical — we already verified credentials work
    }

    // Update DB with fresh tokens, status, and metadata
    const meta = (pmsIntegration.metadata as any) || {};
    await prisma.pmsIntegration.update({
      where: { id: pmsIntegration.id },
      data: {
        status: 'ACTIVE',
        lastSyncAt: new Date(),
        lastError: null,
        requestKey: requestKey,
        refreshKey: refreshKey,
        tokenExpiry: tokenExpiry,
        metadata: {
          ...meta,
          ...(practiceName ? { practiceName } : {}),
          ...(actualPmsType ? { actualPmsType } : {}),
        },
        updatedAt: new Date(),
      },
    });

    // Build display name
    const displayProvider = (actualPmsType && actualPmsType !== 'Unknown')
      ? actualPmsType
      : practiceName || null;

    return NextResponse.json({
      isConnected: true,
      status: 'ACTIVE',
      provider: displayProvider,
      practiceName: practiceName,
      pmsType: actualPmsType,
      lastSync: new Date().toISOString(),
      features: pmsIntegration.features,
    });
  } catch (error) {
    console.error('Error checking PMS connection status:', error);
    return NextResponse.json(
      { isConnected: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
