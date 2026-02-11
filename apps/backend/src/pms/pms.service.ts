import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecretsService } from '../common/services/secrets.service';
import { SetupPmsDto } from './dto/setup-pms.dto';
import { SikkaPmsService } from './providers/sikka.service';
import axios from 'axios';

@Injectable()
export class PmsService {
  private readonly logger = new Logger(PmsService.name);

  constructor(
    private prisma: PrismaService,
    private secrets: SecretsService,
  ) {}

  async setupPmsIntegration(userId: string, dto: SetupPmsDto) {
    this.logger.log(`Setting up ${dto.provider} PMS for user ${userId}`);
    
    if (dto.provider !== 'SIKKA') {
      throw new BadRequestException('Only Sikka is currently supported. Use Sikka marketplace to connect your PMS.');
    }
    
    // 1. Get user's account
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { account: true } } },
    });
    
    if (!user || !user.memberships[0]) {
      throw new BadRequestException('No account found for user');
    }
    
    const account = user.memberships[0].account;
    
    // 2. Check if practice credentials already exist in Secrets Manager
    let practiceCredentials = await this.secrets.getPracticeCredentials(account.id);
    
    if (!practiceCredentials) {
      // No credentials yet - practice hasn't authorized via Sikka marketplace
      this.logger.warn(`No practice credentials found for account ${account.id}`);
      throw new BadRequestException(
        'Practice not authorized. Please complete Sikka marketplace authorization first.'
      );
    }
    
    // 3. Get system-level Sikka credentials from environment
    const systemCredentials = this.getSikkaSystemCredentials();
    
    // 4. Create Sikka service and test connection
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
    
    // 5. Get features from PMS
    const featuresResult = await pmsService.getFeatures();
    const features = featuresResult.success ? featuresResult.data : {};
    
    // 6. Get secret ARN for storage
    const secretArn = `arn:aws:secretsmanager:${process.env.AWS_REGION}:*:secret:parlae/pms/sikka/${account.id}`;
    
    // 7. Save integration config (NO credentials, only secret reference!)
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
          secretArn,
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
          secretArn,
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

  /**
   * Get connection status for frontend polling
   * Used during OAuth flow to detect when connection is complete
   */
  async getConnectionStatus(accountId: string) {
    try {
      // Check if integration exists and is active
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
      
      // Check if connection is active
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
      
      // Connection failed
      if (integration.status === 'INACTIVE' || integration.status === 'ERROR') {
        return {
          isConnected: false,
          status: 'failed',
          provider: 'SIKKA',
          error: integration.lastError || 'Connection failed',
          timestamp: new Date().toISOString(),
        };
      }
      
      // Still connecting
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
   * Get PMS service instance for an account
   * Credentials from AWS Secrets Manager + system env vars
   */
  async getPmsService(accountId: string, provider: string = 'SIKKA', config: any = {}) {
    if (provider !== 'SIKKA') {
      throw new BadRequestException('Only Sikka is currently supported');
    }
    
    // Get practice-specific credentials from Secrets Manager
    const practiceCredentials = await this.secrets.getPracticeCredentials(accountId);
    
    if (!practiceCredentials) {
      throw new BadRequestException(`No practice credentials found for account ${accountId}`);
    }
    
    // Get system-level credentials from environment
    const systemCredentials = this.getSikkaSystemCredentials();
    
    // Combine credentials
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

  /**
   * Get Sikka system-level credentials (shared across all practices)
   */
  private getSikkaSystemCredentials() {
    const appId = process.env.SIKKA_APP_ID;
    const appKey = process.env.SIKKA_APP_KEY;
    
    if (!appId || !appKey) {
      throw new BadRequestException('Sikka system credentials not configured');
    }
    
    return { appId, appKey };
  }

  /**
   * Handle Sikka OAuth callback - exchange code for credentials
   * This is the NEW OAuth 2.0 flow
   */
  async handleSikkaOAuthCallback(code: string, accountId: string) {
    this.logger.log(`Processing Sikka OAuth callback for account ${accountId}`);
    
    try {
      // Get system credentials
      const systemCredentials = this.getSikkaSystemCredentials();
      
      // Step 1: Exchange authorization code for request_key
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
      
      // Step 2: Get authorized practices (contains office_id and secret_key)
      this.logger.log('Fetching authorized practices');
      const practicesResponse = await axios.get(
        'https://api.sikkasoft.com/v4/authorized_practices',
        {
          headers: {
            'Request-Key': requestKey,
          },
        },
      );
      
      const practices = practicesResponse.data.items || [];
      
      if (practices.length === 0) {
        throw new Error('No authorized practices found');
      }
      
      // Use first practice (most cases will have only one)
      const practice = practices[0];
      
      this.logger.log(`Found practice: ${practice.practice_name} (${practice.pms_type})`);
      
      // Calculate token expiry
      const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();
      
      // Step 3: Store in AWS Secrets Manager
      const secretArn = await this.secrets.storePracticeCredentials(accountId, {
        officeId: practice.office_id,
        secretKey: practice.secret_key,
        requestKey: requestKey,
        refreshKey: refreshKey,
        tokenExpiry: tokenExpiry,
        practiceName: practice.practice_name,
        practiceId: practice.practice_id,
        pmsType: practice.pms_type || 'Unknown',
      });
      
      this.logger.log(`Stored credentials in Secrets Manager: ${secretArn}`);
      
      // Step 4: Save integration record in database
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
            secretArn,
            practiceName: practice.practice_name,
            actualPmsType: practice.pms_type || 'Unknown',
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
            secretArn,
            practiceName: practice.practice_name,
            actualPmsType: practice.pms_type || 'Unknown',
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
      
      this.logger.log(`PMS integration saved for account ${accountId}`);
      
      return {
        success: true,
        practiceName: practice.practice_name,
        pmsType: practice.pms_type,
        secretArn,
      };
    } catch (error: any) {
      this.logger.error(`Sikka OAuth callback failed: ${error.message}`, error.stack);
      
      // Save error to database so frontend can retrieve it
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

  /**
   * Generate Sikka request_key and refresh_key
   */
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
