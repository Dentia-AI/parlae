import 'server-only';

import { getLogger } from '@kit/shared/logger';

/**
 * Twilio Phone Number Search Criteria
 */
export interface TwilioSearchCriteria {
  areaCode?: string;
  contains?: string;
  smsEnabled?: boolean;
  mmsEnabled?: boolean;
  voiceEnabled?: boolean;
  excludeAllAddressRequired?: boolean;
  excludeForeignAddressRequired?: boolean;
  excludeLocalAddressRequired?: boolean;
  limit?: number;
}

/**
 * Twilio Available Phone Number
 */
export interface TwilioAvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string; // City
  region: string; // State/Province
  postalCode: string;
  isoCountry: string;
  addressRequirements: string;
  capabilities: {
    voice: boolean;
    SMS: boolean;
    MMS: boolean;
    fax: boolean;
  };
}

/**
 * Twilio Phone Number Configuration
 */
export interface TwilioNumberConfig {
  phoneNumber: string;
  friendlyName?: string;
  voiceUrl?: string;
  voiceMethod?: 'GET' | 'POST';
  smsUrl?: string;
  smsMethod?: 'GET' | 'POST';
  statusCallback?: string;
  statusCallbackMethod?: 'GET' | 'POST';
}

/**
 * Twilio Purchased Phone Number
 */
export interface TwilioPurchasedNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    voice: boolean;
    SMS: boolean;
    MMS: boolean;
    fax: boolean;
  };
}

/**
 * Twilio Service for automated phone number management
 * Use this to bypass GHL UI and programmatically purchase/assign numbers
 */
class TwilioService {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly baseUrl: string;
  private readonly enabled: boolean;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.baseUrl = 'https://api.twilio.com/2010-04-01';
    
    this.enabled = !!(this.accountSid && this.authToken);
  }

  /**
   * Check if Twilio integration is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get basic auth header for Twilio API
   */
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Search for available phone numbers
   * 
   * @param countryCode - ISO country code (e.g., 'US', 'CA')
   * @param type - Number type: 'Local', 'TollFree', or 'Mobile'
   * @param criteria - Search criteria (area code, capabilities, etc.)
   * @returns Array of available phone numbers
   */
  async searchAvailableNumbers(
    countryCode: string = 'US',
    type: 'Local' | 'TollFree' | 'Mobile' = 'Local',
    criteria: TwilioSearchCriteria = {}
  ): Promise<TwilioAvailableNumber[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Twilio] Integration disabled - missing configuration');
      return [];
    }

    try {
      // Build query parameters
      const params = new URLSearchParams();
      
      if (criteria.areaCode) params.append('AreaCode', criteria.areaCode);
      if (criteria.contains) params.append('Contains', criteria.contains);
      if (criteria.smsEnabled !== undefined) params.append('SmsEnabled', String(criteria.smsEnabled));
      if (criteria.mmsEnabled !== undefined) params.append('MmsEnabled', String(criteria.mmsEnabled));
      if (criteria.voiceEnabled !== undefined) params.append('VoiceEnabled', String(criteria.voiceEnabled));
      if (criteria.excludeAllAddressRequired !== undefined) {
        params.append('ExcludeAllAddressRequired', String(criteria.excludeAllAddressRequired));
      }
      if (criteria.excludeForeignAddressRequired !== undefined) {
        params.append('ExcludeForeignAddressRequired', String(criteria.excludeForeignAddressRequired));
      }
      if (criteria.excludeLocalAddressRequired !== undefined) {
        params.append('ExcludeLocalAddressRequired', String(criteria.excludeLocalAddressRequired));
      }
      
      const limit = criteria.limit || 20;
      params.append('PageSize', String(limit));

      const url = `${this.baseUrl}/Accounts/${this.accountSid}/AvailablePhoneNumbers/${countryCode}/${type}.json?${params}`;

      logger.info({
        countryCode,
        type,
        criteria,
      }, '[Twilio] Searching for available phone numbers');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[Twilio] Failed to search available numbers');
        return [];
      }

      const result = await response.json();
      const numbers = result.available_phone_numbers || [];

      const availableNumbers: TwilioAvailableNumber[] = numbers.map((num: any) => ({
        phoneNumber: num.phone_number,
        friendlyName: num.friendly_name,
        locality: num.locality || '',
        region: num.region || '',
        postalCode: num.postal_code || '',
        isoCountry: num.iso_country,
        addressRequirements: num.address_requirements || 'none',
        capabilities: {
          voice: num.capabilities?.voice ?? true,
          SMS: num.capabilities?.SMS ?? true,
          MMS: num.capabilities?.MMS ?? false,
          fax: num.capabilities?.fax ?? false,
        },
      }));

      logger.info({
        countryCode,
        type,
        count: availableNumbers.length,
      }, '[Twilio] Successfully found available numbers');

      return availableNumbers;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      }, '[Twilio] Exception while searching available numbers');

      return [];
    }
  }

  /**
   * Purchase a phone number
   * 
   * @param config - Phone number configuration
   * @param subAccountSid - Optional: Twilio sub-account SID to purchase for
   * @returns Purchased phone number details or null if failed
   */
  async purchaseNumber(
    config: TwilioNumberConfig,
    subAccountSid?: string
  ): Promise<TwilioPurchasedNumber | null> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Twilio] Integration disabled - cannot purchase number');
      return null;
    }

    try {
      const accountSid = subAccountSid || this.accountSid;
      
      // Build form data
      const formData = new URLSearchParams();
      formData.append('PhoneNumber', config.phoneNumber);
      
      if (config.friendlyName) formData.append('FriendlyName', config.friendlyName);
      if (config.voiceUrl) formData.append('VoiceUrl', config.voiceUrl);
      if (config.voiceMethod) formData.append('VoiceMethod', config.voiceMethod);
      if (config.smsUrl) formData.append('SmsUrl', config.smsUrl);
      if (config.smsMethod) formData.append('SmsMethod', config.smsMethod);
      if (config.statusCallback) formData.append('StatusCallback', config.statusCallback);
      if (config.statusCallbackMethod) formData.append('StatusCallbackMethod', config.statusCallbackMethod);

      const url = `${this.baseUrl}/Accounts/${accountSid}/IncomingPhoneNumbers.json`;

      logger.info({
        phoneNumber: config.phoneNumber,
        subAccountSid,
      }, '[Twilio] Purchasing phone number');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          phoneNumber: config.phoneNumber,
        }, '[Twilio] Failed to purchase phone number');
        return null;
      }

      const result = await response.json();

      const purchasedNumber: TwilioPurchasedNumber = {
        sid: result.sid,
        phoneNumber: result.phone_number,
        friendlyName: result.friendly_name,
        capabilities: {
          voice: result.capabilities?.voice ?? true,
          SMS: result.capabilities?.SMS ?? true,
          MMS: result.capabilities?.MMS ?? false,
          fax: result.capabilities?.fax ?? false,
        },
      };

      logger.info({
        phoneNumber: purchasedNumber.phoneNumber,
        sid: purchasedNumber.sid,
        subAccountSid,
      }, '[Twilio] Successfully purchased phone number');

      return purchasedNumber;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
        phoneNumber: config.phoneNumber,
      }, '[Twilio] Exception while purchasing phone number');

      return null;
    }
  }

  /**
   * List phone numbers in an account or sub-account
   * 
   * @param subAccountSid - Optional: Twilio sub-account SID
   * @returns Array of phone numbers
   */
  async listNumbers(subAccountSid?: string): Promise<TwilioPurchasedNumber[]> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Twilio] Integration disabled - cannot list numbers');
      return [];
    }

    try {
      const accountSid = subAccountSid || this.accountSid;
      const url = `${this.baseUrl}/Accounts/${accountSid}/IncomingPhoneNumbers.json`;

      logger.info({
        subAccountSid,
      }, '[Twilio] Listing phone numbers');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
        }, '[Twilio] Failed to list phone numbers');
        return [];
      }

      const result = await response.json();
      const numbers = result.incoming_phone_numbers || [];

      const phoneNumbers: TwilioPurchasedNumber[] = numbers.map((num: any) => ({
        sid: num.sid,
        phoneNumber: num.phone_number,
        friendlyName: num.friendly_name,
        capabilities: {
          voice: num.capabilities?.voice ?? true,
          SMS: num.capabilities?.SMS ?? true,
          MMS: num.capabilities?.MMS ?? false,
          fax: num.capabilities?.fax ?? false,
        },
      }));

      logger.info({
        count: phoneNumbers.length,
        subAccountSid,
      }, '[Twilio] Successfully listed phone numbers');

      return phoneNumbers;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      }, '[Twilio] Exception while listing phone numbers');

      return [];
    }
  }

  /**
   * Release (delete) a phone number
   * 
   * @param phoneSid - Twilio phone number SID
   * @param subAccountSid - Optional: Twilio sub-account SID
   * @returns True if successful
   */
  async releaseNumber(phoneSid: string, subAccountSid?: string): Promise<boolean> {
    const logger = await getLogger();

    if (!this.enabled) {
      logger.warn('[Twilio] Integration disabled - cannot release number');
      return false;
    }

    try {
      const accountSid = subAccountSid || this.accountSid;
      const url = `${this.baseUrl}/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneSid}.json`;

      logger.info({
        phoneSid,
        subAccountSid,
      }, '[Twilio] Releasing phone number');

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          error: errorText,
          phoneSid,
        }, '[Twilio] Failed to release phone number');
        return false;
      }

      logger.info({
        phoneSid,
        subAccountSid,
      }, '[Twilio] Successfully released phone number');

      return true;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
        phoneSid,
      }, '[Twilio] Exception while releasing phone number');

      return false;
    }
  }
}

/**
 * Export a singleton instance
 */
export function createTwilioService() {
  return new TwilioService();
}
