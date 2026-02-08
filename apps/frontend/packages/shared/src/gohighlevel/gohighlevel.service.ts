import 'server-only';

import { getLogger } from '@kit/shared/logger';

/**
 * GoHighLevel Contact Data
 */
export interface GHLContactData {
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  tags?: string[];
  customFields?: Record<string, string | number>;
  source?: string;
}

/**
 * GoHighLevel Voice Data
 */
export interface GHLVoice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  language: string;
  accent?: string;
  description?: string;
}

/**
 * GoHighLevel Phone Number
 */
export interface GHLPhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  city: string;
  state: string;
  capabilities: string[];
  monthlyPrice?: number;
}

/**
 * GoHighLevel Number Pool
 */
export interface GHLNumberPool {
  id: string;
  name: string;
  numbers: string[];
  locationIds: string[];
}

/**
 * GoHighLevel API Response
 */
interface GHLContactResponse {
  contact?: {
    id: string;
    email: string;
    name: string;
    tags: string[];
  };
  error?: string;
  message?: string;
}

/**
 * GoHighLevel API Service
 * Handles contact syncing with GoHighLevel CRM using upsert to merge data
 */
class GoHighLevelService {
  private readonly apiKey: string;
  private readonly locationId: string;
  private readonly baseUrl = 'https://services.leadconnectorhq.com';
  private readonly enabled: boolean;

  constructor() {
    this.apiKey = process.env.GHL_API_KEY || '';
    this.locationId = process.env.GHL_LOCATION_ID || '';
    
    // Service is enabled only if both API key and location ID are configured
    this.enabled = !!(this.apiKey && this.locationId);
  }

  /**
   * Check if GoHighLevel integration is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Upsert a contact in GoHighLevel
   * Uses the upsert endpoint to merge existing data and tags
   * 
   * @param contactData - Contact information to sync
   * @returns Contact ID if successful, null if failed or disabled
   */
  async upsertContact(contactData: GHLContactData): Promise<string | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn({
        hasApiKey: !!this.apiKey,
        hasLocationId: !!this.locationId,
      }, '[GoHighLevel] Integration disabled - missing configuration');
      return null;
    }

    try {
      const payload = this.buildContactPayload(contactData);

      logger.info({
        email: contactData.email,
        tags: contactData.tags,
      }, '[GoHighLevel] Upserting contact');

      const response = await fetch(`${this.baseUrl}/contacts/upsert`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as GHLContactResponse;

      if (!response.ok) {
        logger.error({
          email: contactData.email,
          status: response.status,
          error: result.error || result.message,
        }, '[GoHighLevel] Failed to upsert contact');
        return null;
      }

      const contactId = result.contact?.id;

      logger.info({
        email: contactData.email,
        contactId,
        tags: result.contact?.tags,
      }, '[GoHighLevel] Contact upserted successfully');

      return contactId || null;
    } catch (error) {
      const logger = await getLogger();
      
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
        email: contactData.email,
      }, '[GoHighLevel] Exception while upserting contact');

      // Don't throw - we don't want GHL failures to break user signup
      return null;
    }
  }

  /**
   * Build the contact payload for GoHighLevel API
   */
  private buildContactPayload(contactData: GHLContactData) {
    const payload: Record<string, unknown> = {
      locationId: this.locationId,
      email: contactData.email,
    };

    // Add name - split into firstName/lastName if provided as full name
    if (contactData.firstName || contactData.lastName) {
      payload.firstName = contactData.firstName || '';
      payload.lastName = contactData.lastName || '';
    } else if (contactData.name) {
      const nameParts = contactData.name.trim().split(' ');
      payload.firstName = nameParts[0] || '';
      payload.lastName = nameParts.slice(1).join(' ') || '';
    }

    // Add phone if provided
    if (contactData.phone) {
      payload.phone = contactData.phone;
    }

    // Add tags - these will be MERGED with existing tags using upsert
    if (contactData.tags && contactData.tags.length > 0) {
      payload.tags = contactData.tags;
    }

    // Add custom fields if provided
    if (contactData.customFields) {
      payload.customFields = contactData.customFields;
    }

    // Add source if provided
    if (contactData.source) {
      payload.source = contactData.source;
    }

    return payload;
  }

  /**
   * Parse domain and subdomain from hostname to generate tags
   * 
   * @param hostname - The hostname from the request (e.g., hub.dentiaapp.com)
   * @returns Array of tags based on domain/subdomain
   */
  private parseDomainTags(hostname: string): string[] {
    const tags: string[] = [];

    if (!hostname) {
      return tags;
    }

    const host = hostname.toLowerCase();

    // Determine subdomain/app location
    if (host.includes('hub.dentiaapp.com') || host.includes('hub.dentia')) {
      tags.push('hub-signup');
    } else if (host.includes('www.dentiaapp.com') || host.includes('www.dentia')) {
      tags.push('main-app-signup');
    } else if (host.startsWith('www.')) {
      tags.push('main-app-signup');
    } else if (host.includes('hub')) {
      tags.push('hub-signup');
    } else {
      // Default for other subdomains or no subdomain
      tags.push('main-app-signup');
    }

    // Determine base domain
    if (host.includes('dentia.ca')) {
      tags.push('domain-dentia-ca');
    } else if (host.includes('dentia.co')) {
      tags.push('domain-dentia-co');
    } else if (host.includes('dentiaapp.com')) {
      tags.push('domain-dentiaapp-com');
    } else if (host.includes('dentia.app')) {
      tags.push('domain-dentia-app');
    }

    return tags;
  }

  /**
   * Sync a registered user to GoHighLevel
   * Adds the "registered user" tag automatically along with domain-based tags
   * 
   * @param params - User information from signup
   * @returns Contact ID if successful, null otherwise
   */
  async syncRegisteredUser(params: {
    email: string;
    displayName?: string | null;
    phone?: string;
    hostname?: string;
  }): Promise<string | null> {
    const tags = ['registered user'];
    
    // Add domain-based tags if hostname is provided
    if (params.hostname) {
      const domainTags = this.parseDomainTags(params.hostname);
      tags.push(...domainTags);
    }

    return this.upsertContact({
      email: params.email,
      name: params.displayName || undefined,
      phone: params.phone,
      tags,
      source: 'Dentia App Registration',
    });
  }

  /**
   * Add tags to an existing contact by email
   * Uses upsert to ensure tags are merged, not replaced
   * 
   * @param email - Contact email
   * @param tags - Array of tags to add
   * @param source - Optional source identifier
   * @returns Contact ID if successful, null otherwise
   */
  async addContactTags(params: {
    email: string;
    tags: string[];
    source?: string;
  }): Promise<string | null> {
    const logger = await getLogger();

    if (!params.tags || params.tags.length === 0) {
      logger.warn({
        email: params.email,
      }, '[GoHighLevel] No tags provided to add');
      return null;
    }

    logger.info({
      email: params.email,
      tags: params.tags,
      source: params.source,
    }, '[GoHighLevel] Adding tags to contact');

    // Use upsert with just email and tags - this will merge tags with existing ones
    return this.upsertContact({
      email: params.email,
      tags: params.tags,
      source: params.source,
    });
  }

  /**
   * Get available voices for AI agents
   * Note: GHL Voices API is "coming soon" per their documentation
   * This returns a curated list based on common voice options
   * 
   * @returns Array of available voices
   */
  async getVoices(): Promise<GHLVoice[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[GoHighLevel] Integration disabled - returning empty voices list');
      return [];
    }

    try {
      // TODO: Replace with actual GHL Voices API when available
      // For now, return common voice options that work with GHL
      const voices: GHLVoice[] = [
        {
          id: 'voice-sarah',
          name: 'Sarah',
          gender: 'female',
          language: 'en-US',
          accent: 'American',
          description: 'Warm, professional female voice with American accent',
        },
        {
          id: 'voice-james',
          name: 'James',
          gender: 'male',
          language: 'en-US',
          accent: 'American',
          description: 'Confident, professional male voice with American accent',
        },
        {
          id: 'voice-emily',
          name: 'Emily',
          gender: 'female',
          language: 'en-US',
          accent: 'British',
          description: 'Clear, friendly female voice with British accent',
        },
        {
          id: 'voice-michael',
          name: 'Michael',
          gender: 'male',
          language: 'en-US',
          accent: 'American',
          description: 'Deep, authoritative male voice with American accent',
        },
        {
          id: 'voice-sophia',
          name: 'Sophia',
          gender: 'female',
          language: 'en-US',
          accent: 'American',
          description: 'Energetic, cheerful female voice with American accent',
        },
        {
          id: 'voice-david',
          name: 'David',
          gender: 'male',
          language: 'en-GB',
          accent: 'British',
          description: 'Professional, polished male voice with British accent',
        },
      ];

      logger.info({
        voiceCount: voices.length,
      }, '[GoHighLevel] Returned voices list');

      return voices;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      }, '[GoHighLevel] Exception while fetching voices');

      return [];
    }
  }

  /**
   * Get active phone numbers for the location
   * Uses the Phone System API to retrieve already purchased numbers
   * 
   * @returns Array of active phone numbers
   */
  async getActivePhoneNumbers(): Promise<GHLPhoneNumber[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[GoHighLevel] Integration disabled - returning empty phone numbers list');
      return [];
    }

    try {
      logger.info({
        locationId: this.locationId,
      }, '[GoHighLevel] Fetching active phone numbers');

      const response = await fetch(
        `${this.baseUrl}/phone-system/numbers/location/${this.locationId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[GoHighLevel] Failed to fetch phone numbers');
        return [];
      }

      const result = await response.json();
      const numbers = result.numbers || result.data || [];

      // Map GHL response to our format
      const phoneNumbers: GHLPhoneNumber[] = numbers.map((num: any) => ({
        phoneNumber: num.phoneNumber || num.number,
        friendlyName: num.friendlyName || num.name || 'Unknown',
        city: num.city || 'Unknown',
        state: num.state || num.region || 'Unknown',
        capabilities: num.capabilities || ['Voice', 'SMS'],
        monthlyPrice: num.monthlyPrice || 5.00,
      }));

      logger.info({
        phoneCount: phoneNumbers.length,
      }, '[GoHighLevel] Successfully fetched phone numbers');

      return phoneNumbers;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      }, '[GoHighLevel] Exception while fetching phone numbers');

      return [];
    }
  }

  /**
   * Get number pools for the location
   * Number pools are shared phone numbers that can be used across multiple campaigns
   * 
   * @returns Array of number pools
   */
  async getNumberPools(): Promise<GHLNumberPool[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[GoHighLevel] Integration disabled - returning empty number pools list');
      return [];
    }

    try {
      logger.info({
        locationId: this.locationId,
      }, '[GoHighLevel] Fetching number pools');

      const response = await fetch(
        `${this.baseUrl}/phone-system/number-pools?locationId=${this.locationId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[GoHighLevel] Failed to fetch number pools');
        return [];
      }

      const result = await response.json();
      const pools = result.numberPools || result.data || [];

      // Map GHL response to our format
      const numberPools: GHLNumberPool[] = pools.map((pool: any) => ({
        id: pool.id,
        name: pool.name || 'Unnamed Pool',
        numbers: pool.numbers || [],
        locationIds: pool.locationIds || [],
      }));

      logger.info({
        poolCount: numberPools.length,
      }, '[GoHighLevel] Successfully fetched number pools');

      return numberPools;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      }, '[GoHighLevel] Exception while fetching number pools');

      return [];
    }
  }

  /**
   * Get phone numbers from multiple locations (agency-level view)
   * Note: Requires agency-level API key with access to multiple locations
   * 
   * @param locationIds - Array of location IDs to fetch numbers from
   * @returns Object mapping location IDs to their phone numbers
   */
  async getPhoneNumbersForLocations(
    locationIds: string[]
  ): Promise<Record<string, GHLPhoneNumber[]>> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[GoHighLevel] Integration disabled - returning empty results');
      return {};
    }

    try {
      logger.info({
        locationCount: locationIds.length,
      }, '[GoHighLevel] Fetching phone numbers for multiple locations');

      const results: Record<string, GHLPhoneNumber[]> = {};

      // Fetch numbers for each location in parallel
      await Promise.all(
        locationIds.map(async (locationId) => {
          try {
            const response = await fetch(
              `${this.baseUrl}/phone-system/numbers/location/${locationId}`,
              {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${this.apiKey}`,
                  'Content-Type': 'application/json',
                  'Version': '2021-07-28',
                },
              }
            );

            if (response.ok) {
              const result = await response.json();
              const numbers = result.numbers || result.data || [];

              results[locationId] = numbers.map((num: any) => ({
                phoneNumber: num.phoneNumber || num.number,
                friendlyName: num.friendlyName || num.name || 'Unknown',
                city: num.city || 'Unknown',
                state: num.state || num.region || 'Unknown',
                capabilities: num.capabilities || ['Voice', 'SMS'],
                monthlyPrice: num.monthlyPrice || 5.00,
              }));
            } else {
              logger.warn({
                locationId,
                status: response.status,
              }, '[GoHighLevel] Failed to fetch numbers for location');
              results[locationId] = [];
            }
          } catch (error) {
            logger.error({
              locationId,
              error: error instanceof Error ? error.message : error,
            }, '[GoHighLevel] Exception fetching numbers for location');
            results[locationId] = [];
          }
        })
      );

      const totalNumbers = Object.values(results).reduce(
        (sum, numbers) => sum + numbers.length,
        0
      );

      logger.info({
        locationCount: locationIds.length,
        totalNumbers,
      }, '[GoHighLevel] Successfully fetched phone numbers for locations');

      return results;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      }, '[GoHighLevel] Exception while fetching numbers for multiple locations');

      return {};
    }
  }
}

/**
 * Export a singleton instance
 */
export function createGoHighLevelService() {
  return new GoHighLevelService();
}

