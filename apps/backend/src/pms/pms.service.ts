import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetupPmsDto } from './dto/setup-pms.dto';
import { SikkaPurchaseWebhookDto, SikkaCancelWebhookDto } from './dto/sikka-purchase-webhook.dto';
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

interface ServiceCacheEntry {
  instance: SikkaPmsService;
  expiresAt: number;
}

@Injectable()
export class PmsService {
  private readonly logger = new Logger(PmsService.name);

  private readonly credentialsCache = new Map<string, CacheEntry>();
  private readonly serviceCache = new Map<string, ServiceCacheEntry>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes
  private readonly serviceCacheTtlMs = 10 * 60 * 1000; // 10 minutes

  constructor(private prisma: PrismaService) {}

  /**
   * Invalidate cached credentials for a specific account.
   * Called by SikkaTokenRefreshService after token refresh.
   */
  invalidateCredentialsCache(accountId: string): void {
    this.credentialsCache.delete(accountId);
    this.serviceCache.delete(accountId);
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
    this.logger.log({ provider: dto.provider, userId, msg: '[PMS] Setting up integration' });
    
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
      this.logger.warn({ accountId: account.id, msg: '[PMS] No practice credentials found' });
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
      this.logger.error({ error: connectionTest.error, msg: '[PMS] Connection failed' });
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
    
    this.logger.log({ accountId: account.id, msg: '[PMS] Connected successfully' });
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

      // Auto-upgrade: try to fetch Sikka credentials for SETUP_REQUIRED integrations
      if (integration.status === 'SETUP_REQUIRED' && integration.masterCustomerId) {
        const upgraded = await this.tryUpgradeIntegration(integration);
        if (upgraded) {
          const metadata = upgraded.metadata as any;
          return {
            isConnected: true,
            status: 'connected',
            provider: 'SIKKA',
            practiceName: metadata?.practiceName || 'Unknown',
            pmsType: metadata?.actualPmsType || 'Unknown',
            timestamp: new Date().toISOString(),
          };
        }
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
      this.logger.error({ error: error.message, msg: '[PMS] Failed to get connection status' });
      return {
        isConnected: false,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Attempt to upgrade a SETUP_REQUIRED integration to ACTIVE by
   * fetching credentials from Sikka authorized_practices API.
   * Returns the updated record on success, null if credentials aren't ready yet.
   */
  private async tryUpgradeIntegration(integration: any) {
    try {
      const systemCreds = this.getSikkaSystemCredentials();
      const practiceData = await this.fetchAuthorizedPractice(
        systemCreds,
        integration.masterCustomerId,
      );

      if (!practiceData) {
        this.logger.log({
          accountId: integration.accountId,
          masterCustomerId: integration.masterCustomerId,
          msg: '[PMS] Credentials not yet available in authorized_practices — staying SETUP_REQUIRED',
        });
        return null;
      }

      const tokens = await this.generateRequestKey(
        practiceData.officeId,
        practiceData.secretKey,
        systemCreds.appId,
        systemCreds.appKey,
      );

      const existingMetadata = (integration.metadata as any) || {};
      const metadata = {
        ...existingMetadata,
        practiceName: practiceData.practiceName || existingMetadata.practiceName,
        actualPmsType: practiceData.pmsType || existingMetadata.actualPmsType,
        practiceId: practiceData.practiceId,
      };

      const updated = await this.prisma.pmsIntegration.update({
        where: { id: integration.id },
        data: {
          status: 'ACTIVE',
          officeId: practiceData.officeId,
          secretKey: practiceData.secretKey,
          requestKey: tokens.requestKey,
          refreshKey: tokens.refreshKey,
          tokenExpiry: tokens.tokenExpiry ? new Date(tokens.tokenExpiry) : null,
          metadata,
          lastSyncAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        },
      });

      this.invalidateCredentialsCache(integration.accountId);

      this.logger.log({
        accountId: integration.accountId,
        practiceName: practiceData.practiceName,
        msg: '[PMS] Auto-upgraded SETUP_REQUIRED → ACTIVE via connection-status check',
      });

      return updated;
    } catch (error: any) {
      this.logger.warn({
        accountId: integration.accountId,
        error: error.message,
        msg: '[PMS] Failed to auto-upgrade integration — will retry on next check',
      });
      return null;
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
   * Instances are cached for 10 min to avoid redundant token refreshes and
   * practice-ID verification calls against rate-limited Sikka APIs.
   */
  async getPmsService(accountId: string, provider: string = 'SIKKA', config: any = {}) {
    if (provider !== 'SIKKA') {
      throw new BadRequestException('Only Sikka is currently supported');
    }

    const cached = this.serviceCache.get(accountId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.instance;
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
      practiceId: practiceCredentials.practiceId,
    };
    
    const instance = new SikkaPmsService(accountId, fullCredentials, {
      ...config,
      onPracticeIdCorrected: async (correctedPracticeId: string) => {
        try {
          const integration = await this.prisma.pmsIntegration.findFirst({
            where: { accountId, provider: 'SIKKA', status: 'ACTIVE' },
            select: { id: true, metadata: true },
          });
          if (integration) {
            const meta = (integration.metadata as Record<string, any>) ?? {};
            await this.prisma.pmsIntegration.update({
              where: { id: integration.id },
              data: { metadata: { ...meta, practiceId: correctedPracticeId } },
            });
            this.invalidateCredentialsCache(accountId);
            this.logger.log({ accountId, correctedPracticeId, msg: '[PMS] Persisted corrected practice_id to DB' });
          }
        } catch (err) {
          this.logger.warn({ accountId, error: err instanceof Error ? err.message : err, msg: '[PMS] Failed to persist corrected practice_id' });
        }
      },
    });

    this.serviceCache.set(accountId, {
      instance,
      expiresAt: Date.now() + this.serviceCacheTtlMs,
    });

    return instance;
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
    this.logger.log({ accountId, msg: '[PMS] Processing Sikka OAuth callback' });
    
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
      
      this.logger.log({ expiresIn, msg: '[PMS] Received request_key' });
      
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
      
      this.logger.log({ practiceName: practice.practice_name, pmsType: practice.practice_management_system, msg: '[PMS] Found practice' });
      
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
            practiceId: practice.practice_id,
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
            practiceId: practice.practice_id,
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
      
      this.logger.log({ accountId, msg: '[PMS] Integration saved' });
      
      return {
        success: true,
        practiceName: practice.practice_name,
        pmsType: practice.practice_management_system,
      };
    } catch (error: any) {
      this.logger.error({ error: error.message, msg: '[PMS] Sikka OAuth callback failed' });
      
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

  /**
   * Handle Sikka Registration Handshake webhook for new purchases.
   *
   * Called when a clinic installs the custom SPU and completes Sikka registration.
   * We match the incoming email to an existing Parlae account and auto-connect.
   */
  async handlePurchaseWebhook(dto: SikkaPurchaseWebhookDto): Promise<{ success: boolean; accountId?: string; error?: string }> {
    const email = dto.EmailAddress?.toLowerCase().trim();
    const masterCustomerId = dto.MasterCustomerID;
    const practiceName = dto.PracticeName;
    const partnerRegId = dto.PartnerRegistrationID;

    this.logger.log({
      email,
      masterCustomerId,
      practiceName,
      partnerRegId,
      msg: '[PMS] Sikka purchase webhook received',
    });

    if (!email && !masterCustomerId) {
      this.logger.error('[PMS] Purchase webhook missing both email and Master Customer ID');
      return { success: false, error: 'Missing identifying information' };
    }

    try {
      // Match email to an existing Parlae account
      const account = await this.findAccountByEmail(email);

      if (!account) {
        this.logger.warn({ email, msg: '[PMS] No Parlae account found for webhook email — storing for later matching' });

        // Store the webhook payload for later matching when the user signs up
        await this.storePendingRegistration(dto);
        return { success: true, accountId: undefined };
      }

      this.logger.log({ accountId: account.id, accountName: account.name, msg: '[PMS] Matched webhook to account' });

      // Fetch office_id and secret_key from Sikka authorized_practices
      const systemCreds = this.getSikkaSystemCredentials();
      const practiceData = await this.fetchAuthorizedPractice(systemCreds, masterCustomerId);

      if (!practiceData) {
        this.logger.warn({
          masterCustomerId,
          msg: '[PMS] Practice not yet in authorized_practices — may need time to propagate',
        });

        // Create integration in SETUP_REQUIRED status; connection-status check will upgrade it later
        await this.upsertIntegrationFromWebhook(account.id, dto, null);
        return { success: true, accountId: account.id };
      }

      // Generate request_key using office_id + secret_key
      const tokens = await this.generateRequestKey(
        practiceData.officeId,
        practiceData.secretKey,
        systemCreds.appId,
        systemCreds.appKey,
      );

      // Create or update PmsIntegration as ACTIVE
      await this.upsertIntegrationFromWebhook(account.id, dto, {
        ...practiceData,
        ...tokens,
      });

      this.invalidateCredentialsCache(account.id);

      this.logger.log({ accountId: account.id, practiceName, msg: '[PMS] Auto-connected via purchase webhook' });
      return { success: true, accountId: account.id };
    } catch (error: any) {
      this.logger.error({ error: error.message, email, msg: '[PMS] Purchase webhook processing failed' });
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle Sikka Registration Handshake webhook for cancellations.
   */
  async handleCancelWebhook(dto: SikkaCancelWebhookDto): Promise<{ success: boolean; error?: string }> {
    const masterCustomerId = dto.MasterCustomerID;
    const email = dto.EmailAddress?.toLowerCase().trim();

    this.logger.log({ masterCustomerId, email, msg: '[PMS] Sikka cancel webhook received' });

    try {
      // Find integration by masterCustomerId first, fall back to email
      let integration = masterCustomerId
        ? await this.prisma.pmsIntegration.findFirst({
            where: { masterCustomerId, provider: 'SIKKA' },
          })
        : null;

      if (!integration && email) {
        const account = await this.findAccountByEmail(email);
        if (account) {
          integration = await this.prisma.pmsIntegration.findFirst({
            where: { accountId: account.id, provider: 'SIKKA' },
          });
        }
      }

      if (!integration) {
        this.logger.warn({ masterCustomerId, email, msg: '[PMS] No integration found for cancel webhook' });
        return { success: true };
      }

      await this.prisma.pmsIntegration.update({
        where: { id: integration.id },
        data: {
          status: 'INACTIVE',
          lastError: `Cancelled via Sikka marketplace on ${dto['Cancel Date'] || new Date().toISOString()}`,
          updatedAt: new Date(),
        },
      });

      this.invalidateCredentialsCache(integration.accountId);

      this.logger.log({ accountId: integration.accountId, msg: '[PMS] Integration deactivated via cancel webhook' });
      return { success: true };
    } catch (error: any) {
      this.logger.error({ error: error.message, msg: '[PMS] Cancel webhook processing failed' });
      return { success: false, error: error.message };
    }
  }

  /**
   * Match an email to a Parlae account.
   * Checks User.email -> AccountMembership -> Account (team accounts),
   * then falls back to Account.email.
   */
  private async findAccountByEmail(email?: string): Promise<{ id: string; name: string } | null> {
    if (!email) return null;

    // Check User email -> memberships -> team account (non-personal)
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            account: { select: { id: true, name: true, isPersonalAccount: true } },
          },
        },
      },
    });

    if (user) {
      // Prefer a team (non-personal) account
      const teamAccount = user.memberships.find((m) => !m.account.isPersonalAccount);
      if (teamAccount) return teamAccount.account;

      // Fall back to any account
      if (user.memberships.length > 0) return user.memberships[0].account;
    }

    // Fall back to Account.email direct match
    const account = await this.prisma.account.findFirst({
      where: { email, isPersonalAccount: false },
      select: { id: true, name: true },
    });

    return account || null;
  }

  /**
   * Fetch the authorized practice from Sikka that matches the given masterCustomerId.
   * If masterCustomerId is not available, returns the most recently added practice.
   */
  private async fetchAuthorizedPractice(
    systemCreds: { appId: string; appKey: string },
    masterCustomerId?: string,
  ): Promise<{
    officeId: string;
    secretKey: string;
    practiceId: string;
    practiceName: string;
    pmsType: string;
  } | null> {
    try {
      const response = await axios.get('https://api.sikkasoft.com/v4/authorized_practices', {
        headers: {
          'App-Id': systemCreds.appId,
          'App-Key': systemCreds.appKey,
        },
      });

      const practices = response.data?.items || [];
      if (practices.length === 0) return null;

      // Try matching by customer_id if available
      let practice = masterCustomerId
        ? practices.find((p: any) => String(p.customer_id) === String(masterCustomerId))
        : null;

      // Fall back to the last item (most recently authorized)
      if (!practice) {
        practice = practices[practices.length - 1];
      }

      return {
        officeId: practice.office_id,
        secretKey: practice.secret_key,
        practiceId: practice.practice_id || '',
        practiceName: practice.practice_name || '',
        pmsType: practice.practice_management_system || 'Unknown',
      };
    } catch (error: any) {
      this.logger.error({ error: error.message, msg: '[PMS] Failed to fetch authorized practices' });
      return null;
    }
  }

  /**
   * Create or update a PmsIntegration from webhook data.
   */
  private async upsertIntegrationFromWebhook(
    accountId: string,
    dto: SikkaPurchaseWebhookDto,
    credentials: {
      officeId: string;
      secretKey: string;
      practiceId: string;
      practiceName: string;
      pmsType: string;
      requestKey: string;
      refreshKey: string;
      tokenExpiry: string;
    } | null,
  ) {
    const isActive = credentials !== null;
    const practiceName = credentials?.practiceName || dto.PracticeName || 'Unknown';
    const metadata = {
      practiceName,
      actualPmsType: credentials?.pmsType || 'Unknown',
      practiceId: credentials?.practiceId,
      practicePhone: dto.PracticePhoneNumber,
      practiceCity: dto.PracticeCity,
      practiceState: dto.PracticeState,
      practiceCountry: dto.PracticeCountry,
      practiceAddress: dto.PracticeStreetAddress,
      contactFirstName: dto.FirstName,
      contactLastName: dto.LastName,
      contactEmail: dto.EmailAddress,
      partnerRegistrationId: dto.PartnerRegistrationID,
      purchaseDate: dto.PurchaseDate,
      orderNumber: dto['Order#'],
      registrationSource: 'sikka_purchase_webhook',
    };

    await this.prisma.pmsIntegration.upsert({
      where: {
        accountId_provider: { accountId, provider: 'SIKKA' },
      },
      create: {
        accountId,
        provider: 'SIKKA',
        providerName: 'Sikka (Universal PMS Gateway)',
        status: isActive ? 'ACTIVE' : 'SETUP_REQUIRED',
        config: {},
        features: {} as any,
        metadata,
        masterCustomerId: dto.MasterCustomerID,
        officeId: credentials?.officeId ?? null,
        secretKey: credentials?.secretKey ?? null,
        requestKey: credentials?.requestKey ?? null,
        refreshKey: credentials?.refreshKey ?? null,
        tokenExpiry: credentials?.tokenExpiry ? new Date(credentials.tokenExpiry) : null,
        lastSyncAt: isActive ? new Date() : null,
      },
      update: {
        status: isActive ? 'ACTIVE' : 'SETUP_REQUIRED',
        metadata,
        masterCustomerId: dto.MasterCustomerID,
        officeId: credentials?.officeId ?? undefined,
        secretKey: credentials?.secretKey ?? undefined,
        requestKey: credentials?.requestKey ?? undefined,
        refreshKey: credentials?.refreshKey ?? undefined,
        tokenExpiry: credentials?.tokenExpiry ? new Date(credentials.tokenExpiry) : undefined,
        lastSyncAt: isActive ? new Date() : undefined,
        lastError: null,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Store a pending registration for later matching.
   * When a purchase webhook arrives but no Parlae account matches yet,
   * we stash the data in the metadata JSON. The user can be matched
   * when they sign up or when an admin links them.
   */
  private async storePendingRegistration(dto: SikkaPurchaseWebhookDto) {
    const email = dto.EmailAddress?.toLowerCase().trim();
    this.logger.log({ email, msg: '[PMS] Storing pending Sikka registration' });

    // PmsIntegration requires accountId, so we can't persist yet.
    // Log for manual linking; can be enhanced with a pending_registrations table later.
    this.logger.warn({
      email,
      masterCustomerId: dto.MasterCustomerID,
      practiceName: dto.PracticeName,
      msg: '[PMS] PENDING REGISTRATION — no account matched. Manual linking required.',
    });
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
