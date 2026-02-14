import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

@Injectable()
export class TwilioMessagingService {
  private readonly logger = new Logger(TwilioMessagingService.name);
  private twilioClient: ReturnType<typeof twilio>;

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    this.twilioClient = twilio(accountSid, authToken);
  }

  /**
   * Create a Messaging Service for an account
   * This allows sending SMS without specifying a "from" number
   */
  async createMessagingService(options: {
    accountId: string;
    accountName: string;
  }): Promise<{ sid: string; friendlyName: string }> {
    try {
      const friendlyName = `${options.accountName} - Parlae`;

      this.logger.log({
        accountId: options.accountId,
        friendlyName,
        msg: 'Creating Twilio Messaging Service',
      });

      // Create the messaging service
      const messagingService =
        await this.twilioClient.messaging.v1.services.create({
          friendlyName,
          usecase: 'notifications', // For staff alerts and patient notifications
        });

      this.logger.log({
        accountId: options.accountId,
        messagingServiceSid: messagingService.sid,
        msg: 'Messaging Service created successfully',
      });

      return {
        sid: messagingService.sid,
        friendlyName: messagingService.friendlyName,
      };
    } catch (error) {
      this.logger.error({
        accountId: options.accountId,
        error: error.message,
        msg: 'Failed to create Messaging Service',
      });
      throw error;
    }
  }

  /**
   * Add a phone number to a Messaging Service
   * This number will be used to send SMS from this service
   */
  async addPhoneNumberToService(
    messagingServiceSid: string,
    phoneNumberSid: string,
  ): Promise<void> {
    try {
      this.logger.log({
        messagingServiceSid,
        phoneNumberSid,
        msg: 'Adding phone number to Messaging Service',
      });

      await this.twilioClient.messaging.v1
        .services(messagingServiceSid)
        .phoneNumbers.create({
          phoneNumberSid,
        });

      this.logger.log({
        messagingServiceSid,
        phoneNumberSid,
        msg: 'Phone number added to Messaging Service successfully',
      });
    } catch (error) {
      this.logger.error({
        messagingServiceSid,
        phoneNumberSid,
        error: error.message,
        msg: 'Failed to add phone number to Messaging Service',
      });
      throw error;
    }
  }

  /**
   * Purchase a phone number and create a messaging service for it
   * This is typically called during account setup
   */
  async purchasePhoneNumberWithMessagingService(options: {
    accountId: string;
    accountName: string;
    areaCode: string;
  }): Promise<{
    phoneNumber: string;
    phoneNumberSid: string;
    messagingServiceSid: string;
  }> {
    try {
      this.logger.log({
        accountId: options.accountId,
        areaCode: options.areaCode,
        msg: 'Purchasing phone number with Messaging Service',
      });

      // 1. Search for available phone numbers in the area code
      const availableNumbers =
        await this.twilioClient.availablePhoneNumbers('US').local.list({
          areaCode: parseInt(options.areaCode),
          limit: 1,
        });

      if (!availableNumbers || availableNumbers.length === 0) {
        throw new Error(
          `No available phone numbers found for area code ${options.areaCode}`,
        );
      }

      const selectedNumber = availableNumbers[0].phoneNumber;

      // 2. Purchase the phone number
      const purchasedNumber =
        await this.twilioClient.incomingPhoneNumbers.create({
          phoneNumber: selectedNumber,
          friendlyName: `${options.accountName} - Parlae`,
        });

      this.logger.log({
        accountId: options.accountId,
        phoneNumber: purchasedNumber.phoneNumber,
        phoneNumberSid: purchasedNumber.sid,
        msg: 'Phone number purchased successfully',
      });

      // 3. Create a messaging service
      const messagingService = await this.createMessagingService({
        accountId: options.accountId,
        accountName: options.accountName,
      });

      // 4. Add the phone number to the messaging service
      await this.addPhoneNumberToService(
        messagingService.sid,
        purchasedNumber.sid,
      );

      return {
        phoneNumber: purchasedNumber.phoneNumber,
        phoneNumberSid: purchasedNumber.sid,
        messagingServiceSid: messagingService.sid,
      };
    } catch (error) {
      this.logger.error({
        accountId: options.accountId,
        error: error.message,
        msg: 'Failed to purchase phone number with Messaging Service',
      });
      throw error;
    }
  }

  /**
   * Send an SMS message using a Messaging Service
   */
  async sendSms(options: {
    messagingServiceSid: string;
    to: string;
    body: string;
  }): Promise<void> {
    try {
      await this.twilioClient.messages.create({
        messagingServiceSid: options.messagingServiceSid,
        to: options.to,
        body: options.body,
      });

      this.logger.log({
        messagingServiceSid: options.messagingServiceSid,
        to: options.to,
        msg: 'SMS sent successfully',
      });
    } catch (error) {
      this.logger.error({
        messagingServiceSid: options.messagingServiceSid,
        to: options.to,
        error: error.message,
        msg: 'Failed to send SMS',
      });
      throw error;
    }
  }

  /**
   * Delete a Messaging Service
   * Useful when an account is deleted
   */
  async deleteMessagingService(messagingServiceSid: string): Promise<void> {
    try {
      this.logger.log({
        messagingServiceSid,
        msg: 'Deleting Messaging Service',
      });

      await this.twilioClient.messaging.v1
        .services(messagingServiceSid)
        .remove();

      this.logger.log({
        messagingServiceSid,
        msg: 'Messaging Service deleted successfully',
      });
    } catch (error) {
      this.logger.error({
        messagingServiceSid,
        error: error.message,
        msg: 'Failed to delete Messaging Service',
      });
      throw error;
    }
  }

  /**
   * Release a phone number
   * Useful when an account is deleted or phone number is changed
   */
  async releasePhoneNumber(phoneNumberSid: string): Promise<void> {
    try {
      this.logger.log({
        phoneNumberSid,
        msg: 'Releasing phone number',
      });

      await this.twilioClient.incomingPhoneNumbers(phoneNumberSid).remove();

      this.logger.log({
        phoneNumberSid,
        msg: 'Phone number released successfully',
      });
    } catch (error) {
      this.logger.error({
        phoneNumberSid,
        error: error.message,
        msg: 'Failed to release phone number',
      });
      throw error;
    }
  }
}
