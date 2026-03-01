import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StructuredLogger } from '../../common/structured-logger';
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
  private readonly logger = new StructuredLogger('SikkaTokenService');
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
        this.logger.verbose({ pmsIntegrationId, msg: '[TokenRefresh] Skipping non-Sikka integration' });
        return false;
      }
      
      // Get system-level credentials from environment
      const appId = process.env.SIKKA_APP_ID;
      const appKey = process.env.SIKKA_APP_KEY;
      const refreshKey = integration.refreshKey;
      
      if (!appId || !appKey) {
        this.logger.error({ pmsIntegrationId, msg: '[TokenRefresh] Missing Sikka system credentials in environment' });
        return false;
      }
      
      // Try to refresh if we have a refresh_key
      if (refreshKey) {
        try {
          const result = await this.refreshToken(appId, appKey, refreshKey);
          await this.saveTokens(pmsIntegrationId, result);
          this.logger.verbose({ pmsIntegrationId, msg: '[TokenRefresh] Token refreshed' });
          return true;
        } catch (error) {
          this.logger.warn({ pmsIntegrationId, msg: '[TokenRefresh] Refresh failed, trying initial token' });
        }
      }
      
      // Fallback: Get initial token
      const officeId = integration.officeId;
      const secretKey = integration.secretKey;
      
      if (!officeId || !secretKey) {
        this.logger.error({ pmsIntegrationId, msg: '[TokenRefresh] Missing officeId/secretKey' });
        return false;
      }
      
      const result = await this.getInitialToken(appId, appKey, officeId, secretKey);
      await this.saveTokens(pmsIntegrationId, result);
      this.logger.verbose({ pmsIntegrationId, msg: '[TokenRefresh] Initial token obtained' });
      return true;
      
    } catch (error) {
      this.logger.error({ pmsIntegrationId, error: error instanceof Error ? error.message : error, msg: '[TokenRefresh] Failed to refresh token' });
      
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
    this.logger.verbose({ msg: '[TokenRefresh] Starting token refresh for all Sikka integrations' });
    
    const integrations = await this.prisma.pmsIntegration.findMany({
      where: {
        provider: 'SIKKA',
        status: { in: ['ACTIVE', 'SETUP_REQUIRED'] },
      },
    });
    
    this.logger.verbose({ count: integrations.length, msg: '[TokenRefresh] Found Sikka integrations' });
    
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
    
    this.logger.verbose({ success, failed, msg: '[TokenRefresh] Complete' });
    
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
    
    this.logger.verbose({ count: integrations.length, msg: '[TokenRefresh] Found expiring tokens' });
    
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
