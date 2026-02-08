import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GhlSubAccountStatus,
  type GhlSubAccount,
  type Prisma,
} from '@kit/prisma';

/**
 * Interface for creating a new GHL sub-account
 */
export interface CreateSubAccountDto {
  userId: string;
  accountId?: string;
  businessName: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  businessWebsite?: string;
  timezone?: string;
  industry?: string;
  firstName?: string;
  lastName?: string;
  country?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

/**
 * Response from GHL API when creating a location (sub-account)
 */
interface GhlLocationResponse {
  location?: {
    id: string;
    name: string;
    companyId: string;
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
    timezone?: string;
    [key: string]: any;
  };
  error?: string;
  message?: string;
}

@Injectable()
export class GhlSubAccountService {
  private readonly logger = new Logger(GhlSubAccountService.name);
  private readonly ghlApiKey: string;
  private readonly ghlBaseUrl: string;
  private readonly ghlLocationId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.ghlApiKey = this.configService.get<string>('GHL_API_KEY') || '';
    this.ghlBaseUrl =
      this.configService.get<string>('GHL_BASE_URL') ||
      'https://services.leadconnectorhq.com';
    this.ghlLocationId =
      this.configService.get<string>('GHL_LOCATION_ID') || '';
  }

  /**
   * Check if GHL integration is enabled
   */
  isEnabled(): boolean {
    return !!(this.ghlApiKey && this.ghlLocationId);
  }

  /**
   * Create a new sub-account in GHL and store in database
   * 
   * Requirements:
   * - GHL SaaS Mode must be enabled OR
   * - OAuth token with locations.write scope
   */
  async createSubAccount(
    data: CreateSubAccountDto,
  ): Promise<GhlSubAccount | null> {
    if (!this.isEnabled()) {
      this.logger.warn('GHL integration is not enabled');
      return null;
    }

    try {
      this.logger.log({
        message: 'Creating GHL sub-account',
        businessName: data.businessName,
        userId: data.userId,
      });

      // In development, use existing location instead of creating new one
      // This bypasses SaaS mode requirement for local testing
      const isDevelopment = process.env.NODE_ENV !== 'production';
      let ghlLocation;

      if (isDevelopment) {
        this.logger.log('🔧 Development mode: Using existing GHL location');
        const existingLocationId = this.configService.get<string>('GHL_LOCATION_ID');
        const existingCompanyId = this.configService.get<string>('GHL_COMPANY_ID');
        
        if (!existingLocationId) {
          throw new Error('GHL_LOCATION_ID not configured for development mode');
        }

        // Use existing location details
        ghlLocation = {
          id: existingLocationId,
          companyId: existingCompanyId,
          name: data.businessName,
        };
        
        this.logger.log(`✅ Using existing location: ${existingLocationId}`);
      } else {
        // Production: Create new location in GHL
        this.logger.log('📍 Production mode: Creating new GHL location');
        ghlLocation = await this.createGhlLocation(data);

        if (!ghlLocation) {
          this.logger.error({
            message: 'Failed to create GHL location',
            businessName: data.businessName,
            possibleReasons: [
              'SaaS Mode not enabled in GHL Agency Settings',
              'API token lacks locations.write permission',
              'Incorrect API endpoint or payload format'
            ],
            solution: 'Enable SaaS Mode: Agency Settings → SaaS → Enable SaaS Mode'
          });
          return null;
        }

        this.logger.log({
          message: 'GHL location created successfully',
          ghlLocationId: ghlLocation.id,
          businessName: data.businessName,
        });
      }

      // Store sub-account in database
      // In development, use upsert to reuse existing sub-account for the same location
      let subAccount;
      if (isDevelopment) {
        // Try to find existing sub-account for this location
        const existing = await this.prisma.ghlSubAccount.findUnique({
          where: { ghlLocationId: ghlLocation.id },
        });

        if (existing) {
          this.logger.log({
            message: 'Found existing sub-account for location',
            subAccountId: existing.id,
            ghlLocationId: existing.ghlLocationId,
          });
          // Update business name to match current request
          subAccount = await this.prisma.ghlSubAccount.update({
            where: { id: existing.id },
            data: {
              businessName: data.businessName,
              businessEmail: data.businessEmail,
              businessPhone: data.businessPhone,
              businessAddress: data.businessAddress,
              businessWebsite: data.businessWebsite,
              timezone: data.timezone || existing.timezone,
              industry: data.industry || existing.industry,
              lastSyncedAt: new Date(),
            },
          });
        } else {
          // Create new if none exists
          subAccount = await this.prisma.ghlSubAccount.create({
            data: {
              userId: data.userId,
              accountId: data.accountId,
              ghlLocationId: ghlLocation.id,
              ghlCompanyId: ghlLocation.companyId,
              businessName: data.businessName,
              businessEmail: data.businessEmail,
              businessPhone: data.businessPhone,
              businessAddress: data.businessAddress,
              businessWebsite: data.businessWebsite,
              timezone: data.timezone || 'America/New_York',
              industry: data.industry,
              status: GhlSubAccountStatus.ACTIVE,
              setupCompleted: false,
              setupStep: 1,
              lastSyncedAt: new Date(),
            },
          });
        }
      } else {
        // Production: Always create new sub-account
        subAccount = await this.prisma.ghlSubAccount.create({
          data: {
            userId: data.userId,
            accountId: data.accountId,
            ghlLocationId: ghlLocation.id,
            ghlCompanyId: ghlLocation.companyId,
            businessName: data.businessName,
            businessEmail: data.businessEmail,
            businessPhone: data.businessPhone,
            businessAddress: data.businessAddress,
            businessWebsite: data.businessWebsite,
            timezone: data.timezone || 'America/New_York',
            industry: data.industry,
            status: GhlSubAccountStatus.ACTIVE,
            setupCompleted: false,
            setupStep: 1,
            lastSyncedAt: new Date(),
          },
        });
      }

      this.logger.log({
        message: 'Sub-account ready',
        subAccountId: subAccount.id,
        ghlLocationId: subAccount.ghlLocationId,
      });

      return subAccount;
    } catch (error) {
      this.logger.error({
        message: 'Error creating sub-account',
        error: error.message,
        stack: error.stack,
      });
      return null;
    }
  }

  /**
   * Create a location (sub-account) in GHL via API
   * 
   * Note: Creating locations requires one of the following:
   * 1. Agency-level OAuth token with locations.write scope
   * 2. SaaS mode enabled
   * 3. locations/custom.write scope
   * 
   * Private Integration Tokens (pit-...) typically have sub-account
   * level permissions and may not be able to create new locations.
   */
  private async createGhlLocation(
    data: CreateSubAccountDto,
  ): Promise<GhlLocationResponse['location'] | null> {
    try {
      // Try with companyId first (SaaS mode)
      const ghlCompanyId = this.configService.get<string>('GHL_COMPANY_ID');
      
      const payload = {
        ...(ghlCompanyId && { companyId: ghlCompanyId }),
        name: data.businessName,
        email: data.businessEmail,
        phone: data.businessPhone,
        address: data.businessAddress,
        website: data.businessWebsite,
        timezone: data.timezone || 'America/New_York',
        country: data.country || 'US',
        ...(data.firstName && { firstName: data.firstName }),
        ...(data.lastName && { lastName: data.lastName }),
        ...(data.city && { city: data.city }),
        ...(data.state && { state: data.state }),
        ...(data.postalCode && { postalCode: data.postalCode }),
      };

      this.logger.log({
        message: 'Attempting to create GHL location',
        url: `${this.ghlBaseUrl}/locations`,
        payload: {
          name: payload.name,
          companyId: payload.companyId || 'not-provided',
        },
        apiKeyPrefix: this.ghlApiKey ? this.ghlApiKey.substring(0, 15) : 'missing',
      });

      const response = await fetch(`${this.ghlBaseUrl}/locations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.ghlApiKey}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
        body: JSON.stringify(payload),
      });

      // Check if response has content before parsing JSON
      const responseText = await response.text();
      
      this.logger.log({
        message: 'GHL API response received',
        status: response.status,
        statusText: response.statusText,
        hasContent: !!responseText,
        contentLength: responseText?.length || 0,
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        let errorDetails: any = {};
        
        // Try to parse error response if it exists
        if (responseText) {
          try {
            errorDetails = JSON.parse(responseText);
            errorMessage = errorDetails.error || errorDetails.message || errorMessage;
          } catch {
            // If JSON parsing fails, use the raw text
            errorMessage = responseText || errorMessage;
          }
        }
        
        const saasModeHelp = response.status === 404 || response.status === 403
          ? {
              reason: 'SaaS Mode is likely not enabled in your GHL account',
              solution: 'Go to Agency Settings → SaaS → Enable SaaS Mode',
              currentStatus: 'saasMode: not_activated',
              alternatives: [
                'Enable SaaS Mode (Recommended)',
                'Use OAuth token with locations.write scope',
                'Use Agency-level API token'
              ]
            }
          : {
              reason: 'API request failed',
              solution: 'Check GHL API documentation for required permissions'
            };

        this.logger.error({
          message: 'GHL API error - Unable to create location',
          status: response.status,
          statusText: response.statusText,
          error: errorMessage,
          errorDetails,
          help: saasModeHelp,
        });
        return null;
      }

      // Parse successful response
      if (!responseText) {
        this.logger.error({
          message: 'GHL API returned empty response body',
          status: response.status,
        });
        return null;
      }

      const result = JSON.parse(responseText) as GhlLocationResponse;
      
      if (result.location) {
        this.logger.log({
          message: 'Successfully created GHL location',
          locationId: result.location.id,
          locationName: result.location.name,
        });
      }
      
      return result.location || null;
    } catch (error) {
      this.logger.error({
        message: 'Exception calling GHL API',
        error: error.message,
        stack: error.stack,
      });
      return null;
    }
  }

  /**
   * Get sub-account by ID
   */
  async getSubAccountById(id: string): Promise<GhlSubAccount | null> {
    return this.prisma.ghlSubAccount.findUnique({
      where: { id },
      include: {
        voiceAgents: true,
      },
    });
  }

  /**
   * Get sub-account by user ID
   */
  async getSubAccountByUserId(userId: string): Promise<GhlSubAccount | null> {
    return this.prisma.ghlSubAccount.findFirst({
      where: { userId },
      include: {
        voiceAgents: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get sub-account by GHL location ID
   */
  async getSubAccountByLocationId(
    ghlLocationId: string,
  ): Promise<GhlSubAccount | null> {
    return this.prisma.ghlSubAccount.findUnique({
      where: { ghlLocationId },
      include: {
        voiceAgents: true,
      },
    });
  }

  /**
   * Update sub-account
   */
  async updateSubAccount(
    id: string,
    data: Prisma.GhlSubAccountUpdateInput,
  ): Promise<GhlSubAccount> {
    return this.prisma.ghlSubAccount.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Update setup progress
   */
  async updateSetupStep(
    id: string,
    setupStep: number,
    completed: boolean = false,
  ): Promise<GhlSubAccount> {
    return this.prisma.ghlSubAccount.update({
      where: { id },
      data: {
        setupStep,
        setupCompleted: completed,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Suspend sub-account
   */
  async suspendSubAccount(id: string): Promise<GhlSubAccount> {
    return this.prisma.ghlSubAccount.update({
      where: { id },
      data: {
        status: GhlSubAccountStatus.SUSPENDED,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Reactivate sub-account
   */
  async reactivateSubAccount(id: string): Promise<GhlSubAccount> {
    return this.prisma.ghlSubAccount.update({
      where: { id },
      data: {
        status: GhlSubAccountStatus.ACTIVE,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Delete sub-account (soft delete)
   */
  async deleteSubAccount(id: string): Promise<GhlSubAccount> {
    return this.prisma.ghlSubAccount.update({
      where: { id },
      data: {
        status: GhlSubAccountStatus.DELETED,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Sync sub-account data from GHL
   */
  async syncSubAccountFromGhl(
    ghlLocationId: string,
  ): Promise<GhlSubAccount | null> {
    try {
      const response = await fetch(
        `${this.ghlBaseUrl}/locations/${ghlLocationId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.ghlApiKey}`,
            Version: '2021-07-28',
          },
        },
      );

      if (!response.ok) {
        this.logger.error({
          message: 'Failed to sync from GHL',
          status: response.status,
        });
        return null;
      }

      const result = (await response.json()) as GhlLocationResponse;
      const location = result.location;

      if (!location) {
        return null;
      }

      // Update local database with GHL data
      const subAccount = await this.prisma.ghlSubAccount.update({
        where: { ghlLocationId },
        data: {
          businessName: location.name,
          businessEmail: location.email,
          businessPhone: location.phone,
          businessAddress: location.address,
          businessWebsite: location.website,
          timezone: location.timezone,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log({
        message: 'Sub-account synced from GHL',
        ghlLocationId,
      });

      return subAccount;
    } catch (error) {
      this.logger.error({
        message: 'Error syncing from GHL',
        error: error.message,
      });
      return null;
    }
  }

  /**
   * List all sub-accounts for a user
   */
  async listUserSubAccounts(userId: string): Promise<GhlSubAccount[]> {
    return this.prisma.ghlSubAccount.findMany({
      where: {
        userId,
        status: {
          not: GhlSubAccountStatus.DELETED,
        },
      },
      include: {
        voiceAgents: {
          select: {
            id: true,
            name: true,
            status: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Create sub-account record from existing GHL location (for development)
   */
  async createSubAccountFromExisting(
    data: CreateSubAccountDto & { ghlLocationId: string; ghlCompanyId: string },
  ): Promise<GhlSubAccount | null> {
    try {
      this.logger.log({
        message: 'Creating sub-account from existing GHL location',
        ghlLocationId: data.ghlLocationId,
        userId: data.userId,
      });

      const subAccount = await this.prisma.ghlSubAccount.create({
        data: {
          userId: data.userId,
          accountId: data.accountId,
          ghlLocationId: data.ghlLocationId,
          ghlCompanyId: data.ghlCompanyId,
          businessName: data.businessName,
          businessEmail: data.businessEmail,
          businessPhone: data.businessPhone,
          businessAddress: data.businessAddress,
          businessWebsite: data.businessWebsite,
          timezone: data.timezone || 'America/New_York',
          industry: data.industry,
          status: GhlSubAccountStatus.ACTIVE,
          setupCompleted: false,
          setupStep: 1, // Ready for voice agent setup
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log({
        message: 'Sub-account record created from existing location',
        subAccountId: subAccount.id,
        ghlLocationId: subAccount.ghlLocationId,
      });

      return subAccount;
    } catch (error) {
      this.logger.error({
        message: 'Error creating sub-account from existing location',
        error: error.message,
        stack: error.stack,
      });
      return null;
    }
  }
}


