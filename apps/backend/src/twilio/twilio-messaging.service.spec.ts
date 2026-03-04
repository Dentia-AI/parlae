import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TwilioMessagingService } from './twilio-messaging.service';

jest.mock('twilio', () => {
  const mockClient = {
    messages: { create: jest.fn().mockResolvedValue({ sid: 'SM_test' }) },
    messaging: {
      v1: {
        services: Object.assign(
          jest.fn().mockReturnValue({
            phoneNumbers: { create: jest.fn().mockResolvedValue({}) },
            remove: jest.fn().mockResolvedValue(undefined),
          }),
          {
            create: jest.fn().mockResolvedValue({ sid: 'MG_test', friendlyName: 'Test' }),
          },
        ),
      },
    },
    availablePhoneNumbers: jest.fn().mockReturnValue({
      local: { list: jest.fn().mockResolvedValue([{ phoneNumber: '+14155551234' }]) },
    }),
    incomingPhoneNumbers: Object.assign(
      jest.fn().mockReturnValue({ remove: jest.fn().mockResolvedValue(undefined) }),
      { create: jest.fn().mockResolvedValue({ sid: 'PN_test', phoneNumber: '+14155551234' }) },
    ),
  };
  return jest.fn().mockReturnValue(mockClient);
});

describe('TwilioMessagingService', () => {
  let service: TwilioMessagingService;

  const createService = async (overrides: Record<string, string> = {}) => {
    const defaults: Record<string, string> = {
      TWILIO_ACCOUNT_SID: 'AC_test',
      TWILIO_AUTH_TOKEN: 'auth_test',
      ...overrides,
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioMessagingService,
        { provide: ConfigService, useValue: { get: jest.fn((k: string) => defaults[k]) } },
      ],
    }).compile();
    return module.get<TwilioMessagingService>(TwilioMessagingService);
  };

  beforeEach(async () => {
    service = await createService();
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should set client to null when creds missing', async () => {
      const svc = await createService({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' });
      await expect(svc.createMessagingService({ accountId: 'a', accountName: 'b' }))
        .rejects.toThrow('Twilio not configured');
    });
  });

  describe('sendSms', () => {
    it('should send SMS successfully', async () => {
      const result = await service.sendSms({
        messagingServiceSid: 'MG_1',
        to: '+14155551234',
        body: 'Hi',
      });
      expect(result?.sid).toBe('SM_test');
    });

    it('should silently return undefined when no client', async () => {
      const svc = await createService({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' });
      const result = await svc.sendSms({
        messagingServiceSid: 'MG_1',
        to: '+14155551234',
        body: 'Hi',
      });
      expect(result).toBeUndefined();
    });

    it('should throw when Twilio API fails', async () => {
      const twilio = require('twilio');
      twilio().messages.create.mockRejectedValueOnce(new Error('Send failed'));
      await expect(
        service.sendSms({ messagingServiceSid: 'MG_1', to: '+14155551234', body: 'Hi' }),
      ).rejects.toThrow('Send failed');
    });

    it('should pass correct params to messages.create', async () => {
      const twilio = require('twilio');
      const mockCreate = twilio().messages.create;
      await service.sendSms({
        messagingServiceSid: 'MG_123',
        to: '+15551234567',
        body: 'Test message',
      });
      expect(mockCreate).toHaveBeenCalledWith({
        messagingServiceSid: 'MG_123',
        to: '+15551234567',
        body: 'Test message',
      });
    });
  });

  describe('createMessagingService', () => {
    it('should create messaging service', async () => {
      const result = await service.createMessagingService({ accountId: 'a', accountName: 'Test' });
      expect(result.sid).toBe('MG_test');
    });

    it('should throw when Twilio API fails', async () => {
      const twilio = require('twilio');
      const mockCreate = twilio().messaging.v1.services.create;
      mockCreate.mockRejectedValueOnce(new Error('API error'));
      await expect(
        service.createMessagingService({ accountId: 'a', accountName: 'Test' }),
      ).rejects.toThrow('API error');
    });
  });

  describe('addPhoneNumberToService', () => {
    it('should add phone number to messaging service', async () => {
      await service.addPhoneNumberToService('MG_1', 'PN_1');
    });

    it('should throw when no client', async () => {
      const svc = await createService({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' });
      await expect(svc.addPhoneNumberToService('MG_1', 'PN_1')).rejects.toThrow(
        'Twilio not configured',
      );
    });

    it('should throw when Twilio API fails', async () => {
      const twilio = require('twilio');
      const mockServices = twilio().messaging.v1.services;
      const mockPhoneNumbers = mockServices().phoneNumbers;
      mockPhoneNumbers.create.mockRejectedValueOnce(new Error('Add failed'));
      await expect(service.addPhoneNumberToService('MG_1', 'PN_1')).rejects.toThrow('Add failed');
    });
  });

  describe('purchasePhoneNumberWithMessagingService', () => {
    it('should purchase number and create service', async () => {
      const result = await service.purchasePhoneNumberWithMessagingService({
        accountId: 'a',
        accountName: 'Test',
        areaCode: '415',
      });
      expect(result.phoneNumber).toBe('+14155551234');
      expect(result.messagingServiceSid).toBe('MG_test');
    });

    it('should throw when no available numbers', async () => {
      const twilio = require('twilio');
      twilio().availablePhoneNumbers.mockReturnValueOnce({
        local: { list: jest.fn().mockResolvedValue([]) },
      });
      await expect(
        service.purchasePhoneNumberWithMessagingService({
          accountId: 'a',
          accountName: 'Test',
          areaCode: '999',
        }),
      ).rejects.toThrow('No available phone numbers found');
    });

    it('should throw when no client', async () => {
      const svc = await createService({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' });
      await expect(
        svc.purchasePhoneNumberWithMessagingService({
          accountId: 'a',
          accountName: 'Test',
          areaCode: '415',
        }),
      ).rejects.toThrow('Twilio not configured');
    });

    it('should throw when incomingPhoneNumbers.create fails', async () => {
      const twilio = require('twilio');
      twilio().incomingPhoneNumbers.create.mockRejectedValueOnce(new Error('Purchase failed'));
      await expect(
        service.purchasePhoneNumberWithMessagingService({
          accountId: 'a',
          accountName: 'Test',
          areaCode: '415',
        }),
      ).rejects.toThrow('Purchase failed');
    });

    it('should throw when createMessagingService fails after purchase', async () => {
      const twilio = require('twilio');
      twilio().messaging.v1.services.create.mockRejectedValueOnce(new Error('Create service failed'));
      await expect(
        service.purchasePhoneNumberWithMessagingService({
          accountId: 'a',
          accountName: 'Test',
          areaCode: '415',
        }),
      ).rejects.toThrow('Create service failed');
    });

    it('should throw when addPhoneNumberToService fails', async () => {
      const twilio = require('twilio');
      const mockServices = twilio().messaging.v1.services;
      mockServices().phoneNumbers.create.mockRejectedValueOnce(new Error('Add number failed'));
      await expect(
        service.purchasePhoneNumberWithMessagingService({
          accountId: 'a',
          accountName: 'Test',
          areaCode: '415',
        }),
      ).rejects.toThrow('Add number failed');
    });
  });

  describe('deleteMessagingService', () => {
    it('should delete messaging service', async () => {
      await service.deleteMessagingService('MG_1');
    });

    it('should throw when no client', async () => {
      const svc = await createService({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' });
      await expect(svc.deleteMessagingService('MG_1')).rejects.toThrow('Twilio not configured');
    });

    it('should throw when Twilio API fails', async () => {
      const twilio = require('twilio');
      const mockServices = twilio().messaging.v1.services;
      mockServices().remove.mockRejectedValueOnce(new Error('Delete failed'));
      await expect(service.deleteMessagingService('MG_1')).rejects.toThrow('Delete failed');
    });
  });

  describe('releasePhoneNumber', () => {
    it('should release phone number', async () => {
      await service.releasePhoneNumber('PN_1');
    });

    it('should throw when no client', async () => {
      const svc = await createService({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' });
      await expect(svc.releasePhoneNumber('PN_1')).rejects.toThrow('Twilio not configured');
    });

    it('should throw when Twilio API fails', async () => {
      const twilio = require('twilio');
      twilio().incomingPhoneNumbers.mockReturnValueOnce({
        remove: jest.fn().mockRejectedValue(new Error('Release failed')),
      });
      await expect(service.releasePhoneNumber('PN_1')).rejects.toThrow('Release failed');
    });
  });
});
