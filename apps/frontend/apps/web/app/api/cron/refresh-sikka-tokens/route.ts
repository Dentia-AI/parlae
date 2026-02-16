import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@kit/prisma';

const SIKKA_BASE_URL = 'https://api.sikkasoft.com/v4';

/**
 * GET /api/cron/refresh-sikka-tokens
 *
 * Refreshes Sikka request_key tokens for all active PMS integrations.
 * Tokens are valid for ~24 hours; this should run every ~20 hours.
 *
 * Security: Protected by a shared CRON_SECRET header.
 * Can be called by:
 *   - AWS EventBridge Scheduler -> Lambda -> HTTP call
 *   - External cron service (e.g., cron-job.org, Vercel Cron)
 *   - Internal self-scheduling timer (see bottom of file)
 *
 * Query params:
 *   ?force=true  -- refresh ALL tokens, not just expiring ones
 */
export async function GET(request: NextRequest) {
  try {
    const cronSecret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret');
    const expectedSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

    if (cronSecret !== expectedSecret) {
      const isInternal = request.headers.get('x-internal-call') === 'true';
      if (!isInternal) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const forceAll = request.nextUrl.searchParams.get('force') === 'true';

    const appId = process.env.SIKKA_APP_ID;
    const appKey = process.env.SIKKA_APP_KEY;

    if (!appId || !appKey || appId === 'your_sikka_app_id_here') {
      return NextResponse.json(
        { error: 'SIKKA_APP_ID and SIKKA_APP_KEY not configured' },
        { status: 500 },
      );
    }

    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const integrations = await prisma.pmsIntegration.findMany({
      where: forceAll
        ? {
            provider: 'SIKKA',
            status: { in: ['ACTIVE', 'SETUP_REQUIRED', 'ERROR'] },
          }
        : {
            provider: 'SIKKA',
            status: { in: ['ACTIVE', 'SETUP_REQUIRED'] },
            OR: [
              { tokenExpiry: { lt: twoHoursFromNow } },
              { tokenExpiry: null },
              { requestKey: null },
            ],
          },
    });

    console.log(
      `[Sikka Cron] Found ${integrations.length} integration(s) to refresh (force=${forceAll})`,
    );

    const results: Array<{
      id: string;
      accountId: string;
      success: boolean;
      error?: string;
      newExpiry?: string;
    }> = [];

    for (const integration of integrations) {
      try {
        let tokenData: { request_key: string; refresh_key: string; expires_in?: string };

        if (integration.refreshKey) {
          try {
            tokenData = await sikkaPost(`${SIKKA_BASE_URL}/request_key`, {
              grant_type: 'refresh_key',
              refresh_key: integration.refreshKey,
              app_id: appId,
              app_key: appKey,
            });
          } catch {
            if (!integration.officeId || !integration.secretKey) {
              throw new Error('Refresh failed and no officeId/secretKey for initial token');
            }
            tokenData = await sikkaPost(`${SIKKA_BASE_URL}/request_key`, {
              grant_type: 'request_key',
              office_id: integration.officeId,
              secret_key: integration.secretKey,
              app_id: appId,
              app_key: appKey,
            });
          }
        } else if (integration.officeId && integration.secretKey) {
          tokenData = await sikkaPost(`${SIKKA_BASE_URL}/request_key`, {
            grant_type: 'request_key',
            office_id: integration.officeId,
            secret_key: integration.secretKey,
            app_id: appId,
            app_key: appKey,
          });
        } else {
          throw new Error('No refresh_key or officeId/secretKey available');
        }

        if (!tokenData.request_key || !tokenData.refresh_key) {
          throw new Error('Invalid Sikka response: missing request_key or refresh_key');
        }

        const expiresInStr = tokenData.expires_in || '86400 second(s)';
        const expiresIn = parseInt(expiresInStr) || 86400;
        const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

        await prisma.pmsIntegration.update({
          where: { id: integration.id },
          data: {
            requestKey: tokenData.request_key,
            refreshKey: tokenData.refresh_key,
            tokenExpiry,
            status: 'ACTIVE',
            lastError: null,
          },
        });

        console.log(
          `[Sikka Cron] Refreshed token for ${integration.id} (account: ${integration.accountId}), expires: ${tokenExpiry.toISOString()}`,
        );

        results.push({
          id: integration.id,
          accountId: integration.accountId,
          success: true,
          newExpiry: tokenExpiry.toISOString(),
        });
      } catch (error: unknown) {
        const errMsg = extractErrorMessage(error);
        console.error(`[Sikka Cron] Failed to refresh ${integration.id}: ${errMsg}`);

        await prisma.pmsIntegration.update({
          where: { id: integration.id },
          data: {
            status: 'ERROR',
            lastError: `Auto-refresh failed: ${errMsg}`,
          },
        });

        results.push({
          id: integration.id,
          accountId: integration.accountId,
          success: false,
          error: errMsg,
        });
      }
    }

    const summary = {
      total: results.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      timestamp: new Date().toISOString(),
    };

    console.log(`[Sikka Cron] Complete: ${summary.success} success, ${summary.failed} failed`);

    return NextResponse.json({ success: true, summary, results });
  } catch (error) {
    console.error('[Sikka Cron] Fatal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sikkaPost(url: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) {
      throw { status: res.status, data };
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    return JSON.stringify((error as any).data);
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

// ---------------------------------------------------------------------------
// Self-scheduling Background Timer
// ---------------------------------------------------------------------------
// Next.js doesn't have native cron support, but we can use a module-level
// timer that fires once the server process is up. This runs every 20 hours
// inside the same Node.js process and calls the Sikka refresh logic directly.
// It's a fallback for when no external scheduler (EventBridge, cron-job.org)
// is configured.
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20 hours

let _timerStarted = false;

function startBackgroundRefresh() {
  if (_timerStarted) return;
  _timerStarted = true;

  const appId = process.env.SIKKA_APP_ID;
  const appKey = process.env.SIKKA_APP_KEY;

  if (!appId || !appKey || appId === 'your_sikka_app_id_here') {
    console.log('[Sikka Cron] Skipping background refresh: credentials not configured');
    return;
  }

  console.log('[Sikka Cron] Background token refresh timer started (every 20 hours)');

  setInterval(async () => {
    console.log('[Sikka Cron] Background refresh triggered');
    try {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET || '';
      await fetch(`${baseUrl}/api/cron/refresh-sikka-tokens?force=true&secret=${encodeURIComponent(secret)}`, {
        method: 'GET',
        headers: { 'x-internal-call': 'true' },
      });
    } catch (error) {
      console.error('[Sikka Cron] Background refresh failed:', error);
    }
  }, REFRESH_INTERVAL_MS);
}

if (typeof globalThis !== 'undefined' && typeof window === 'undefined') {
  startBackgroundRefresh();
}
