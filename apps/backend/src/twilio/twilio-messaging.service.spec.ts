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
      await service.sendSms({ messagingServiceSid: 'MG_1', to: '+14155551234', body: 'Hi' });
    });

    it('should silently return when no client', async () => {
      const svc = await createService({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' });
      await svc.sendSms({ messagingServiceSid: 'MG_1', to: '+14155551234', body: 'Hi' });
    });
  });

  describe('createMessagingService', () => {
    it('should create messaging service', async () => {
      const result = await service.createMessagingService({ accountId: 'a', accountName: 'Test' });
      expect(result.sid).toBe('MG_test');
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
  });

  describe('deleteMessagingService', () => {
    it('should delete messaging service', async () => {
      await service.deleteMessagingService('MG_1');
    });

    it('should throw when no client', async () => {
      const svc = await createService({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' });
      await expect(svc.deleteMessagingService('MG_1')).rejects.toThrow('Twilio not configured');
    });
  });

  describe('releasePhoneNumber', () => {
    it('should release phone number', async () => {
      await service.releasePhoneNumber('PN_1');
    });
  });
});
