export const createMockTwilioClient = () => ({
  messages: {
    create: jest.fn().mockResolvedValue({ sid: 'SM_test_123' }),
  },
  messaging: {
    v1: {
      services: jest.fn().mockReturnValue({
        phoneNumbers: {
          create: jest.fn().mockResolvedValue({ sid: 'PN_test_123' }),
        },
        remove: jest.fn().mockResolvedValue(undefined),
      }),
      create: jest.fn(),
    },
  },
  availablePhoneNumbers: jest.fn().mockReturnValue({
    local: {
      list: jest.fn().mockResolvedValue([
        { phoneNumber: '+14155551234' },
      ]),
    },
  }),
  incomingPhoneNumbers: {
    create: jest.fn().mockResolvedValue({
      sid: 'PN_purchased_123',
      phoneNumber: '+14155551234',
    }),
  },
});

// Create the messaging service mock that's directly injectable
export const createMockTwilioMessagingService = () => ({
  sendSms: jest.fn().mockResolvedValue(undefined),
  createMessagingService: jest.fn().mockResolvedValue({
    sid: 'MG_test_123',
    friendlyName: 'Test - Parlae',
  }),
  addPhoneNumberToService: jest.fn().mockResolvedValue(undefined),
  purchasePhoneNumberWithMessagingService: jest.fn().mockResolvedValue({
    phoneNumber: '+14155551234',
    phoneNumberSid: 'PN_test_123',
    messagingServiceSid: 'MG_test_123',
  }),
  deleteMessagingService: jest.fn().mockResolvedValue(undefined),
  releasePhoneNumber: jest.fn().mockResolvedValue(undefined),
});
