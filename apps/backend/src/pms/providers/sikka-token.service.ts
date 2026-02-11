import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

/**
 * Sikka Token Refresh Service
 * 
 * Automatically refreshes Sikka request_key tokens before they expire (24 hours)
 * 
 * Usage:
 * - Run as a cron job or background worker
 * - Call refreshAllTokens() every 23 hours
 * - Monitors token expiry and refreshes proactively
 */

interface TokenRefreshResult {
  requestKey: string;
  refreshKey: string;
  expiresIn: number;
}

@Injectable()
export class SikkaTokenRefreshService {
  private readonly baseUrl = 'https://api.sikkasoft.com/v4';
  
  constructor(private prisma: PrismaService) {}
  
  /**
   * Refresh a single PMS integration's token
   */
  async refreshIntegrationToken(pmsIntegrationId: string): Promise<boolean> {
    try {
      const integration = await this.prisma.pmsIntegration.findUnique({
        where: { id: pmsIntegrationId },
      });
      
      if (!integration || integration.provider !== 'SIKKA') {
        console.log(`[TokenRefresh] Skipping non-Sikka integration: ${pmsIntegrationId}`);
        return false;
      }
      
      // Get system-level credentials from environment
      const appId = process.env.SIKKA_APP_ID;
      const appKey = process.env.SIKKA_APP_KEY;
      const refreshKey = integration.refreshKey;
      
      if (!appId || !appKey) {
        console.error(`[TokenRefresh] Missing Sikka system credentials in environment for ${pmsIntegrationId}`);
        return false;
      }
      
      // Try to refresh if we have a refresh_key
      if (refreshKey) {
        try {
          const result = await this.refreshToken(appId, appKey, refreshKey);
          await this.saveTokens(pmsIntegrationId, result);
          console.log(`[TokenRefresh] ✅ Token refreshed for ${pmsIntegrationId}`);
          return true;
        } catch (error) {
          console.warn(`[TokenRefresh] Refresh failed, trying initial token...`);
        }
      }
      
      // Fallback: Get initial token
      const officeId = integration.officeId;
      const secretKey = integration.secretKey;
      
      if (!officeId || !secretKey) {
        console.error(`[TokenRefresh] Missing officeId/secretKey for ${pmsIntegrationId}`);
        return false;
      }
      
      const result = await this.getInitialToken(appId, appKey, officeId, secretKey);
      await this.saveTokens(pmsIntegrationId, result);
      console.log(`[TokenRefresh] ✅ Initial token obtained for ${pmsIntegrationId}`);
      return true;
      
    } catch (error) {
      console.error(`[TokenRefresh] ❌ Failed to refresh token for ${pmsIntegrationId}:`, error);
      
      // Update integration status
      await this.prisma.pmsIntegration.update({
        where: { id: pmsIntegrationId },
        data: {
          status: 'ERROR',
          lastError: `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      });
      
      return false;
    }
  }
  
  /**
   * Refresh tokens for all active Sikka integrations
   */
  async refreshAllTokens(): Promise<{ success: number; failed: number }> {
    console.log('[TokenRefresh] Starting token refresh for all Sikka integrations...');
    
    const integrations = await this.prisma.pmsIntegration.findMany({
      where: {
        provider: 'SIKKA',
        status: { in: ['ACTIVE', 'SETUP_REQUIRED'] },
      },
    });
    
    console.log(`[TokenRefresh] Found ${integrations.length} Sikka integration(s)`);
    
    let success = 0;
    let failed = 0;
    
    for (const integration of integrations) {
      const result = await this.refreshIntegrationToken(integration.id);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }
    
    console.log(`[TokenRefresh] Complete: ${success} success, ${failed} failed`);
    
    return { success, failed };
  }
  
  /**
   * Refresh tokens that are expiring soon (within 2 hours)
   */
  async refreshExpiringTokens(): Promise<{ success: number; failed: number }> {
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    
    const integrations = await this.prisma.pmsIntegration.findMany({
      where: {
        provider: 'SIKKA',
        status: 'ACTIVE',
        tokenExpiry: {
          lt: twoHoursFromNow,
        },
      },
    });
    
    console.log(`[TokenRefresh] Found ${integrations.length} expiring token(s)`);
    
    let success = 0;
    let failed = 0;
    
    for (const integration of integrations) {
      const result = await this.refreshIntegrationToken(integration.id);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }
    
    return { success, failed };
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  /**
   * Get initial token using request_key grant
   */
  private async getInitialToken(
    appId: string,
    appKey: string,
    officeId: string,
    secretKey: string
  ): Promise<TokenRefreshResult> {
    const response = await axios.post(
      `${this.baseUrl}/request_key`,
      {
        grant_type: 'request_key',
        office_id: officeId,
        secret_key: secretKey,
        app_id: appId,
        app_key: appKey,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    
    const data = response.data;
    
    if (!data.request_key || !data.refresh_key) {
      throw new Error('Invalid token response');
    }
    
    // Parse expires_in (e.g., "85603 second(s)")
    const expiresInStr = data.expires_in || '86400 second(s)';
    const expiresIn = parseInt(expiresInStr) || 86400;
    
    return {
      requestKey: data.request_key,
      refreshKey: data.refresh_key,
      expiresIn,
    };
  }
  
  /**
   * Refresh token using refresh_key grant
   */
  private async refreshToken(
    appId: string,
    appKey: string,
    refreshKey: string
  ): Promise<TokenRefreshResult> {
    const response = await axios.post(
      `${this.baseUrl}/request_key`,
      {
        grant_type: 'refresh_key',
        refresh_key: refreshKey,
        app_id: appId,
        app_key: appKey,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    
    const data = response.data;
    
    if (!data.request_key || !data.refresh_key) {
      throw new Error('Invalid token response');
    }
    
    const expiresInStr = data.expires_in || '86400 second(s)';
    const expiresIn = parseInt(expiresInStr) || 86400;
    
    return {
      requestKey: data.request_key,
      refreshKey: data.refresh_key,
      expiresIn,
    };
  }
  
  /**
   * Save tokens to database
   */
  private async saveTokens(pmsIntegrationId: string, tokens: TokenRefreshResult): Promise<void> {
    await this.prisma.pmsIntegration.update({
      where: { id: pmsIntegrationId },
      data: {
        requestKey: tokens.requestKey,
        refreshKey: tokens.refreshKey,
        tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000),
        status: 'ACTIVE',
        lastError: null,
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * Standalone function to refresh all tokens (for cron job)
 * Note: Use NestJS dependency injection instead when possible
 */
export async function refreshAllSikkaTokens(prismaService: any) {
  const service = new SikkaTokenRefreshService(prismaService);
  return await service.refreshAllTokens();
}

/**
 * Standalone function to refresh expiring tokens (for cron job)
 * Note: Use NestJS dependency injection instead when possible
 */
export async function refreshExpiringSikkaTokens(prismaService: any) {
  const service = new SikkaTokenRefreshService(prismaService);
  return await service.refreshExpiringTokens();
}
