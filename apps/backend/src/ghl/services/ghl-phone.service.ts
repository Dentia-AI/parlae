import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  areaCode: string;
  city?: string;
  state?: string;
  country: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
  };
  monthlyPrice?: number;
  setupPrice?: number;
  available: boolean;
}

interface GhlPhoneNumbersResponse {
  phoneNumbers?: PhoneNumber[];
  error?: string;
  message?: string;
}

@Injectable()
export class GhlPhoneService {
  private readonly logger = new Logger(GhlPhoneService.name);
  private readonly ghlApiKey: string;
  private readonly ghlBaseUrl: string;

  // Mock phone numbers for development
  private readonly MOCK_PHONE_NUMBERS: PhoneNumber[] = [
    {
      phoneNumber: '+1 (555) 123-4567',
      friendlyName: 'US - New York',
      areaCode: '555',
      city: 'New York',
      state: 'NY',
      country: 'US',
      capabilities: { voice: true, sms: true },
      monthlyPrice: 1.00,
      available: true,
    },
    {
      phoneNumber: '+1 (555) 234-5678',
      friendlyName: 'US - Los Angeles',
      areaCode: '555',
      city: 'Los Angeles',
      state: 'CA',
      country: 'US',
      capabilities: { voice: true, sms: true },
      monthlyPrice: 1.00,
      available: true,
    },
    {
      phoneNumber: '+1 (555) 345-6789',
      friendlyName: 'US - Chicago',
      areaCode: '555',
      city: 'Chicago',
      state: 'IL',
      country: 'US',
      capabilities: { voice: true, sms: true },
      monthlyPrice: 1.00,
      available: true,
    },
    {
      phoneNumber: '+1 (555) 456-7890',
      friendlyName: 'US - Houston',
      areaCode: '555',
      city: 'Houston',
      state: 'TX',
      country: 'US',
      capabilities: { voice: true, sms: true },
      monthlyPrice: 1.00,
      available: true,
    },
    {
      phoneNumber: '+1 (555) 567-8901',
      friendlyName: 'US - Miami',
      areaCode: '555',
      city: 'Miami',
      state: 'FL',
      country: 'US',
      capabilities: { voice: true, sms: true },
      monthlyPrice: 1.00,
      available: true,
    },
  ];

  constructor(private readonly configService: ConfigService) {
    this.ghlApiKey = this.configService.get<string>('GHL_API_KEY') || '';
    this.ghlBaseUrl =
      this.configService.get<string>('GHL_BASE_URL') ||
      'https://services.leadconnectorhq.com';
  }

  /**
   * Get available phone numbers
   */
  async getAvailablePhoneNumbers(
    areaCode?: string,
    state?: string,
  ): Promise<PhoneNumber[]> {
    try {
      this.logger.log({
        message: 'Fetching available phone numbers',
        areaCode,
        state,
      });

      // Try to fetch from GHL API
      const ghlNumbers = await this.fetchPhoneNumbersFromGhl(areaCode, state);

      if (ghlNumbers && ghlNumbers.length > 0) {
        this.logger.log({
          message: 'Fetched phone numbers from GHL',
          count: ghlNumbers.length,
        });
        return ghlNumbers;
      }

      // Fallback to mock data
      let numbers = this.MOCK_PHONE_NUMBERS;

      // Apply filters
      if (areaCode) {
        numbers = numbers.filter((n) => n.areaCode === areaCode);
      }

      if (state) {
        numbers = numbers.filter((n) => n.state === state);
      }

      this.logger.log({
        message: 'Using mock phone numbers',
        count: numbers.length,
      });

      return numbers;
    } catch (error) {
      this.logger.error({
        message: 'Error fetching phone numbers',
        error: error.message,
      });
      return this.MOCK_PHONE_NUMBERS;
    }
  }

  /**
   * Search phone numbers by area code
   */
  async searchByAreaCode(areaCode: string): Promise<PhoneNumber[]> {
    return this.getAvailablePhoneNumbers(areaCode);
  }

  /**
   * Search phone numbers by state
   */
  async searchByState(state: string): Promise<PhoneNumber[]> {
    return this.getAvailablePhoneNumbers(undefined, state);
  }

  /**
   * Assign phone number to voice agent
   */
  async assignPhoneNumber(
    phoneNumber: string,
    ghlAgentId: string,
  ): Promise<boolean> {
    try {
      this.logger.log({
        message: 'Assigning phone number to agent',
        phoneNumber,
        ghlAgentId,
      });

      // Call GHL API to assign number
      const response = await fetch(
        `${this.ghlBaseUrl}/phone-numbers/assign`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.ghlApiKey}`,
            'Content-Type': 'application/json',
            Version: '2021-07-28',
          },
          body: JSON.stringify({
            phoneNumber,
            agentId: ghlAgentId,
          }),
        },
      );

      if (!response.ok) {
        this.logger.error({
          message: 'Failed to assign phone number',
          status: response.status,
        });
        return false;
      }

      this.logger.log({
        message: 'Phone number assigned successfully',
        phoneNumber,
        ghlAgentId,
      });

      return true;
    } catch (error) {
      this.logger.error({
        message: 'Error assigning phone number',
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Fetch phone numbers from GHL API
   */
  private async fetchPhoneNumbersFromGhl(
    areaCode?: string,
    state?: string,
  ): Promise<PhoneNumber[] | null> {
    try {
      if (!this.ghlApiKey) {
        return null;
      }

      const queryParams = new URLSearchParams();
      if (areaCode) queryParams.append('areaCode', areaCode);
      if (state) queryParams.append('state', state);

      const url = `${this.ghlBaseUrl}/phone-numbers/available?${queryParams}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.ghlApiKey}`,
          Version: '2021-07-28',
        },
      });

      if (!response.ok) {
        this.logger.warn({
          message: 'GHL phone numbers API not available',
          status: response.status,
        });
        return null;
      }

      const result = (await response.json()) as GhlPhoneNumbersResponse;
      return result.phoneNumbers || null;
    } catch (error) {
      this.logger.warn({
        message: 'Could not fetch phone numbers from GHL',
        error: error.message,
      });
      return null;
    }
  }
}
