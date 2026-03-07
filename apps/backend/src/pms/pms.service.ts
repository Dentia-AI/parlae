import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetupPmsDto } from './dto/setup-pms.dto';
import { SikkaPmsService } from './providers/sikka.service';
import axios from 'axios';

export interface SikkaPracticeCredentials {
  officeId: string;
  secretKey: string;
  requestKey?: string;
  refreshKey?: string;
  tokenExpiry?: string;
  practiceName?: string;
  practiceId?: string;
  pmsType?: string;
}

interface CacheEntry {
  value: SikkaPracticeCredentials;
  expiresAt: number;
}

@Injectable()
export class PmsService {
  private readonly logger = new Logger(PmsService.name);

  private readonly credentialsCache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(private prisma: PrismaService) {}

  /**
   * Invalidate cached credentials for a specific account.
   * Called by SikkaTokenRefreshService after token refresh.
   */
  invalidateCredentialsCache(accountId: string): void {
    this.credentialsCache.delete(accountId);
  }

  private async loadPracticeCredentials(accountId: string): Promise<SikkaPracticeCredentials | null> {
    const cached = this.credentialsCache.get(accountId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    const integration = await this.prisma.pmsIntegration.findFirst({
      where: { accountId, provider: 'SIKKA', status: 'ACTIVE' },
      select: {
        officeId: true,
        secretKey: true,
        requestKey: true,
        refreshKey: true,
        tokenExpiry: true,
        metadata: true,
      },
    });

    if (!integration?.officeId || !integration?.secretKey) {
      return null;
    }

    const meta = (integration.metadata as any) ?? {};
    const creds: SikkaPracticeCredentials = {
      officeId: integration.officeId,
      secretKey: integration.secretKey,
      requestKey: integration.requestKey ?? undefined,
      refreshKey: integration.refreshKey ?? undefined,
      tokenExpiry: integration.tokenExpiry?.toISOString(),
      practiceName: meta.practiceName,
      practiceId: meta.practiceId,
      pmsType: meta.actualPmsType,
    };

    this.credentialsCache.set(accountId, {
      value: creds,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return creds;
  }

  async setupPmsIntegration(userId: string, dto: SetupPmsDto) {
    this.logger.log(`Setting up ${dto.provider} PMS for user ${userId}`);
    
    if (dto.provider !== 'SIKKA') {
      throw new BadRequestException('Only Sikka is currently supported. Use Sikka marketplace to connect your PMS.');
    }
    
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { account: true } } },
    });
    
    if (!user || !user.memberships[0]) {
      throw new BadRequestException('No account found for user');
    }
    
    const account = user.memberships[0].account;
    
    const practiceCredentials = await this.loadPracticeCredentials(account.id);
    
    if (!practiceCredentials) {
      this.logger.warn(`No practice credentials found for account ${account.id}`);
      throw new BadRequestException(
        'Practice not authorized. Please complete Sikka marketplace authorization first.'
      );
    }
    
    const systemCredentials = this.getSikkaSystemCredentials();
    
    const sikkaCredentials = {
      appId: systemCredentials.appId,
      appKey: systemCredentials.appKey,
      officeId: practiceCredentials.officeId,
      secretKey: practiceCredentials.secretKey,
      requestKey: practiceCredentials.requestKey,
      refreshKey: practiceCredentials.refreshKey,
    };
    
    const pmsService = new SikkaPmsService(account.id, sikkaCredentials, dto.config);
    const connectionTest = await pmsService.testConnection();
    
    if (!connectionTest.success) {
      this.logger.error(`PMS connection failed: ${connectionTest.error}`);
      throw new BadRequestException(`Failed to connect to Sikka: ${connectionTest.error}`);
    }
    
    const featuresResult = await pmsService.getFeatures();
    const features = featuresResult.success ? featuresResult.data : {};
    
    await this.prisma.pmsIntegration.upsert({
      where: {
        accountId_provider: {
          accountId: account.id,
          provider: dto.provider,
        },
      },
      create: {
        accountId: account.id,
        provider: dto.provider,
        providerName: 'Sikka (Universal PMS Gateway)',
        config: dto.config || {},
        features: features as any || {},
        status: 'ACTIVE',
        lastSyncAt: new Date(),
        metadata: {
          practiceName: practiceCredentials.practiceName,
          actualPmsType: practiceCredentials.pmsType || 'Unknown',
        },
      },
      update: {
        config: dto.config || {},
        features: features as any || {},
        status: 'ACTIVE',
        lastSyncAt: new Date(),
        lastError: null,
        metadata: {
          practiceName: practiceCredentials.practiceName,
          actualPmsType: practiceCredentials.pmsType || 'Unknown',
        },
        updatedAt: new Date(),
      },
    });
    
    this.logger.log(`PMS connected successfully for account ${account.id}`);
    return { 
      success: true, 
      provider: dto.provider,
      features: features || {},
      status: 'ACTIVE',
      practiceName: practiceCredentials.practiceName,
      pmsType: practiceCredentials.pmsType,
    };
  }

  async getConnectionStatus(accountId: string) {
    try {
      const integration = await this.prisma.pmsIntegration.findFirst({
        where: {
          accountId: accountId,
          provider: 'SIKKA',
        },
      });
      
      if (!integration) {
        return {
          isConnected: false,
          status: 'pending',
          timestamp: new Date().toISOString(),
        };
      }
      
      if (integration.status === 'ACTIVE') {
        const metadata = integration.metadata as any;
        return {
          isConnected: true,
          status: 'connected',
          provider: 'SIKKA',
          practiceName: metadata?.practiceName || 'Unknown',
          pmsType: metadata?.actualPmsType || 'Unknown',
          timestamp: new Date().toISOString(),
        };
      }
      
      if (integration.status === 'INACTIVE' || integration.status === 'ERROR') {
        return {
          isConnected: false,
          status: 'failed',
          provider: 'SIKKA',
          error: integration.lastError || 'Connection failed',
          timestamp: new Date().toISOString(),
        };
      }
      
      return {
        isConnected: false,
        status: 'connecting',
        provider: 'SIKKA',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to get connection status: ${error.message}`);
      return {
        isConnected: false,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getPmsStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: true },
    });
    
    if (!user || !user.memberships[0]) {
      throw new BadRequestException('No account found');
    }
    
    const integrations = await this.prisma.pmsIntegration.findMany({
      where: { accountId: user.memberships[0].accountId },
      select: {
        id: true,
        provider: true,
        providerName: true,
        status: true,
        lastSyncAt: true,
        lastError: true,
        features: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    return { success: true, integrations };
  }

  /**
   * Get PMS service instance for an account.
   * Reads credentials from the DB with in-memory caching (5 min TTL).
   */
  async getPmsService(accountId: string, provider: string = 'SIKKA', config: any = {}) {
    if (provider !== 'SIKKA') {
      throw new BadRequestException('Only Sikka is currently supported');
    }
    
    const practiceCredentials = await this.loadPracticeCredentials(accountId);
    
    if (!practiceCredentials) {
      throw new BadRequestException(`No practice credentials found for account ${accountId}`);
    }
    
    const systemCredentials = this.getSikkaSystemCredentials();
    
    const fullCredentials = {
      appId: systemCredentials.appId,
      appKey: systemCredentials.appKey,
      officeId: practiceCredentials.officeId,
      secretKey: practiceCredentials.secretKey,
      requestKey: practiceCredentials.requestKey,
      refreshKey: practiceCredentials.refreshKey,
    };
    
    return new SikkaPmsService(accountId, fullCredentials, config);
  }

  private getSikkaSystemCredentials() {
    const appId = process.env.SIKKA_APP_ID;
    const appKey = process.env.SIKKA_APP_KEY;
    
    if (!appId || !appKey) {
      throw new BadRequestException('Sikka system credentials not configured');
    }
    
    return { appId, appKey };
  }

  async handleSikkaOAuthCallback(code: string, accountId: string) {
    this.logger.log(`Processing Sikka OAuth callback for account ${accountId}`);
    
    try {
      const systemCredentials = this.getSikkaSystemCredentials();
      
      this.logger.log('Exchanging authorization code for request_key');
      const tokenResponse = await axios.post(
        'https://api.sikkasoft.com/v4/request_key',
        {
          grant_type: 'authorization_code',
          code: code,
          app_id: systemCredentials.appId,
          app_key: systemCredentials.appKey,
        },
      );
      
      const requestKey = tokenResponse.data.request_key;
      const refreshKey = tokenResponse.data.refresh_key;
      const expiresIn = tokenResponse.data.expires_in;
      
      this.logger.log(`Received request_key, expires in ${expiresIn} seconds`);
      
      this.logger.log('Fetching authorized practices');
      const practicesResponse = await axios.get(
        'https://api.sikkasoft.com/v4/authorized_practices',
        {
          headers: {
            'App-Id': systemCredentials.appId,
            'App-Key': systemCredentials.appKey,
          },
        },
      );
      
      const practices = practicesResponse.data.items || [];
      
      if (practices.length === 0) {
        throw new Error('No authorized practices found');
      }
      
      const practice = practices[0];
      
      this.logger.log(`Found practice: ${practice.practice_name} (${practice.practice_management_system})`);
      
      const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();
      
      await this.prisma.pmsIntegration.upsert({
        where: {
          accountId_provider: {
            accountId: accountId,
            provider: 'SIKKA',
          },
        },
        create: {
          accountId: accountId,
          provider: 'SIKKA',
          providerName: 'Sikka (Universal PMS Gateway)',
          config: {},
          features: {} as any,
          status: 'ACTIVE',
          lastSyncAt: new Date(),
          metadata: {
            practiceName: practice.practice_name,
            actualPmsType: practice.practice_management_system || 'Unknown',
            officeId: practice.office_id,
          },
          officeId: practice.office_id,
          secretKey: practice.secret_key,
          requestKey: requestKey,
          refreshKey: refreshKey,
          tokenExpiry: new Date(tokenExpiry),
        },
        update: {
          status: 'ACTIVE',
          lastSyncAt: new Date(),
          metadata: {
            practiceName: practice.practice_name,
            actualPmsType: practice.practice_management_system || 'Unknown',
            officeId: practice.office_id,
          },
          officeId: practice.office_id,
          secretKey: practice.secret_key,
          requestKey: requestKey,
          refreshKey: refreshKey,
          tokenExpiry: new Date(tokenExpiry),
          updatedAt: new Date(),
        },
      });

      this.invalidateCredentialsCache(accountId);
      
      this.logger.log(`PMS integration saved for account ${accountId}`);
      
      return {
        success: true,
        practiceName: practice.practice_name,
        pmsType: practice.practice_management_system,
      };
    } catch (error: any) {
      this.logger.error(`Sikka OAuth callback failed: ${error.message}`, error.stack);
      
      try {
        await this.prisma.pmsIntegration.upsert({
          where: {
            accountId_provider: {
              accountId: accountId,
              provider: 'SIKKA',
            },
          },
          create: {
            accountId: accountId,
            provider: 'SIKKA',
            providerName: 'Sikka (Universal PMS Gateway)',
            config: {},
            features: {} as any,
            status: 'ERROR',
            lastError: error.message,
          },
          update: {
            status: 'ERROR',
            lastError: error.message,
            updatedAt: new Date(),
          },
        });
      } catch (dbError) {
        this.logger.error('Failed to save error to database', dbError);
      }
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async generateRequestKey(
    officeId: string,
    secretKey: string,
    appId: string,
    appKey: string,
  ) {
    const response = await axios.post(
      'https://api.sikkasoft.com/v4/request_key',
      {
        grant_type: 'request_key',
        office_id: officeId,
        secret_key: secretKey,
        app_id: appId,
        app_key: appKey,
      },
    );
    
    return {
      requestKey: response.data.request_key,
      refreshKey: response.data.refresh_key,
      tokenExpiry: response.data.end_time,
    };
  }

  private getProviderName(provider: string): string {
    const names: Record<string, string> = {
      SIKKA: 'Sikka',
      KOLLA: 'Kolla',
      DENTRIX: 'Dentrix',
      EAGLESOFT: 'Eaglesoft',
      OPEN_DENTAL: 'Open Dental',
      CUSTOM: 'Custom',
    };
    return names[provider] || provider;
  }
}
