jest.mock('server-only', () => ({}));
jest.mock('@kit/shared/logger', () => ({
  getLogger: jest.fn().mockResolvedValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    TWILIO_ACCOUNT_SID: 'AC_test_sid',
    TWILIO_AUTH_TOKEN: 'test_auth_token',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

import { createTwilioService } from './twilio.service';

function mockOk(data: any) {
  return { ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) };
}

function mockError(status: number, text = 'Error') {
  return { ok: false, status, json: () => Promise.resolve({}), text: () => Promise.resolve(text) };
}

describe('TwilioService', () => {
  describe('isEnabled', () => {
    it('returns true when both SID and token are set', () => {
      const svc = createTwilioService();
      expect(svc.isEnabled()).toBe(true);
    });

    it('returns false when SID is missing', () => {
      process.env.TWILIO_ACCOUNT_SID = '';
      const svc = createTwilioService();
      expect(svc.isEnabled()).toBe(false);
    });

    it('returns false when auth token is missing', () => {
      process.env.TWILIO_AUTH_TOKEN = '';
      const svc = createTwilioService();
      expect(svc.isEnabled()).toBe(false);
    });
  });

  describe('when disabled', () => {
    beforeEach(() => {
      process.env.TWILIO_ACCOUNT_SID = '';
    });

    it('searchAvailableNumbers returns empty array', async () => {
      const svc = createTwilioService();
      expect(await svc.searchAvailableNumbers()).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('purchaseNumber returns null', async () => {
      const svc = createTwilioService();
      expect(await svc.purchaseNumber({ phoneNumber: '+1' })).toBeNull();
    });

    it('listNumbers returns empty array', async () => {
      const svc = createTwilioService();
      expect(await svc.listNumbers()).toEqual([]);
    });

    it('releaseNumber returns false', async () => {
      const svc = createTwilioService();
      expect(await svc.releaseNumber('PN123')).toBe(false);
    });

    it('createMessagingServiceForNumber returns null', async () => {
      const svc = createTwilioService();
      expect(await svc.createMessagingServiceForNumber('PN123', 'Test')).toBeNull();
    });

    it('createSipTrunkForRetell returns null', async () => {
      const svc = createTwilioService();
      expect(await svc.createSipTrunkForRetell('Test', 'domain')).toBeNull();
    });

    it('associateNumberWithTrunk returns false', async () => {
      const svc = createTwilioService();
      expect(await svc.associateNumberWithTrunk('TK123', 'PN123')).toBe(false);
    });

    it('getPhoneNumberSid returns null', async () => {
      const svc = createTwilioService();
      expect(await svc.getPhoneNumberSid('+14165551234')).toBeNull();
    });
  });

  describe('searchAvailableNumbers', () => {
    it('searches with correct URL and returns mapped numbers', async () => {
      mockFetch.mockResolvedValue(mockOk({
        available_phone_numbers: [
          {
            phone_number: '+14165551234',
            friendly_name: '(416) 555-1234',
            locality: 'Toronto',
            region: 'ON',
            postal_code: 'M5V',
            iso_country: 'CA',
            address_requirements: 'none',
            capabilities: { voice: true, SMS: true, MMS: false, fax: false },
          },
        ],
      }));

      const svc = createTwilioService();
      const result = await svc.searchAvailableNumbers('CA', 'Local', {
        areaCode: '416',
        voiceEnabled: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.phoneNumber).toBe('+14165551234');
      expect(result[0]!.locality).toBe('Toronto');
      expect(result[0]!.capabilities.voice).toBe(true);

      const url = mockFetch.mock.calls[0]![0] as string;
      expect(url).toContain('/AvailablePhoneNumbers/CA/Local.json');
      expect(url).toContain('AreaCode=416');
      expect(url).toContain('VoiceEnabled=true');
    });

    it('returns empty array on API error', async () => {
      mockFetch.mockResolvedValue(mockError(500));

      const svc = createTwilioService();
      const result = await svc.searchAvailableNumbers();
      expect(result).toEqual([]);
    });

    it('returns empty array on exception', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const svc = createTwilioService();
      const result = await svc.searchAvailableNumbers();
      expect(result).toEqual([]);
    });

    it('passes all search criteria as query params', async () => {
      mockFetch.mockResolvedValue(mockOk({ available_phone_numbers: [] }));

      const svc = createTwilioService();
      await svc.searchAvailableNumbers('US', 'TollFree', {
        contains: 'HELLO',
        smsEnabled: true,
        mmsEnabled: false,
        excludeAllAddressRequired: true,
        limit: 5,
      });

      const url = mockFetch.mock.calls[0]![0] as string;
      expect(url).toContain('/TollFree.json');
      expect(url).toContain('Contains=HELLO');
      expect(url).toContain('SmsEnabled=true');
      expect(url).toContain('MmsEnabled=false');
      expect(url).toContain('ExcludeAllAddressRequired=true');
      expect(url).toContain('PageSize=5');
    });
  });

  describe('purchaseNumber', () => {
    it('purchases and returns phone number details', async () => {
      mockFetch.mockResolvedValue(mockOk({
        sid: 'PN_abc',
        phone_number: '+14165551234',
        friendly_name: '(416) 555-1234',
        capabilities: { voice: true, SMS: true, MMS: false, fax: false },
      }));

      const svc = createTwilioService();
      const result = await svc.purchaseNumber({
        phoneNumber: '+14165551234',
        friendlyName: 'Main Line',
        voiceUrl: 'https://example.com/voice',
      });

      expect(result).not.toBeNull();
      expect(result!.sid).toBe('PN_abc');
      expect(result!.phoneNumber).toBe('+14165551234');

      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/IncomingPhoneNumbers.json');
      expect(opts.method).toBe('POST');
    });

    it('uses sub-account SID when provided', async () => {
      mockFetch.mockResolvedValue(mockOk({
        sid: 'PN_sub',
        phone_number: '+1',
        friendly_name: 'Sub',
        capabilities: {},
      }));

      const svc = createTwilioService();
      await svc.purchaseNumber({ phoneNumber: '+1' }, 'AC_sub_sid');

      const url = mockFetch.mock.calls[0]![0] as string;
      expect(url).toContain('/Accounts/AC_sub_sid/');
    });

    it('returns null on API error', async () => {
      mockFetch.mockResolvedValue(mockError(400));

      const svc = createTwilioService();
      expect(await svc.purchaseNumber({ phoneNumber: '+1' })).toBeNull();
    });

    it('returns null on exception', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));

      const svc = createTwilioService();
      expect(await svc.purchaseNumber({ phoneNumber: '+1' })).toBeNull();
    });
  });

  describe('listNumbers', () => {
    it('returns mapped phone numbers', async () => {
      mockFetch.mockResolvedValue(mockOk({
        incoming_phone_numbers: [
          {
            sid: 'PN_1',
            phone_number: '+14165551234',
            friendly_name: 'Main',
            capabilities: { voice: true, SMS: true },
          },
        ],
      }));

      const svc = createTwilioService();
      const result = await svc.listNumbers();

      expect(result).toHaveLength(1);
      expect(result[0]!.sid).toBe('PN_1');
      expect(result[0]!.phoneNumber).toBe('+14165551234');
    });

    it('uses sub-account SID when provided', async () => {
      mockFetch.mockResolvedValue(mockOk({ incoming_phone_numbers: [] }));

      const svc = createTwilioService();
      await svc.listNumbers('AC_sub');

      const url = mockFetch.mock.calls[0]![0] as string;
      expect(url).toContain('/Accounts/AC_sub/');
    });

    it('returns empty array on error', async () => {
      mockFetch.mockResolvedValue(mockError(500));

      const svc = createTwilioService();
      expect(await svc.listNumbers()).toEqual([]);
    });
  });

  describe('releaseNumber', () => {
    it('sends DELETE and returns true', async () => {
      mockFetch.mockResolvedValue(mockOk({}));

      const svc = createTwilioService();
      const result = await svc.releaseNumber('PN_abc');

      expect(result).toBe(true);
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/IncomingPhoneNumbers/PN_abc.json');
      expect(opts.method).toBe('DELETE');
    });

    it('uses sub-account SID when provided', async () => {
      mockFetch.mockResolvedValue(mockOk({}));

      const svc = createTwilioService();
      await svc.releaseNumber('PN_abc', 'AC_sub');

      const url = mockFetch.mock.calls[0]![0] as string;
      expect(url).toContain('/Accounts/AC_sub/');
    });

    it('returns false on error', async () => {
      mockFetch.mockResolvedValue(mockError(404));

      const svc = createTwilioService();
      expect(await svc.releaseNumber('PN_missing')).toBe(false);
    });
  });

  describe('createMessagingServiceForNumber', () => {
    it('creates messaging service and adds phone number', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOk({ sid: 'MG_abc' }))  // Create service
        .mockResolvedValueOnce(mockOk({}));                  // Add phone number

      const svc = createTwilioService();
      const result = await svc.createMessagingServiceForNumber('PN_abc', 'Clinic SMS');

      expect(result).toBe('MG_abc');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const createUrl = mockFetch.mock.calls[0]![0] as string;
      expect(createUrl).toBe('https://messaging.twilio.com/v1/Services');
    });

    it('returns service SID even if adding phone number fails', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOk({ sid: 'MG_partial' }))
        .mockResolvedValueOnce(mockError(400));

      const svc = createTwilioService();
      const result = await svc.createMessagingServiceForNumber('PN_abc', 'Test');

      expect(result).toBe('MG_partial');
    });

    it('returns null when service creation fails', async () => {
      mockFetch.mockResolvedValue(mockError(500));

      const svc = createTwilioService();
      expect(await svc.createMessagingServiceForNumber('PN_abc', 'Test')).toBeNull();
    });
  });

  describe('createSipTrunkForRetell', () => {
    it('reuses existing trunk with matching domain', async () => {
      mockFetch.mockResolvedValueOnce(mockOk({
        trunks: [
          { sid: 'TK_existing', domain_name: 'parlae.pstn.twilio.com' },
        ],
      }));

      const svc = createTwilioService();
      const result = await svc.createSipTrunkForRetell('Parlae', 'parlae');

      expect(result).not.toBeNull();
      expect(result!.trunkSid).toBe('TK_existing');
      expect(result!.terminationUri).toBe('parlae.pstn.twilio.com');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('creates new trunk when none matches', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOk({ trunks: [] }))          // List trunks
        .mockResolvedValueOnce(mockOk({ sid: 'TK_new' }))       // Create trunk
        .mockResolvedValueOnce(mockOk({}));                       // Add origination

      const svc = createTwilioService();
      const result = await svc.createSipTrunkForRetell('Parlae', 'parlae');

      expect(result!.trunkSid).toBe('TK_new');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('returns null when trunk creation fails', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOk({ trunks: [] }))
        .mockResolvedValueOnce(mockError(500));

      const svc = createTwilioService();
      expect(await svc.createSipTrunkForRetell('Test', 'domain')).toBeNull();
    });

    it('appends .pstn.twilio.com to domain name if needed', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOk({ trunks: [] }))
        .mockResolvedValueOnce(mockOk({ sid: 'TK_1' }))
        .mockResolvedValueOnce(mockOk({}));

      const svc = createTwilioService();
      await svc.createSipTrunkForRetell('Test', 'mydomain');

      const createBody = mockFetch.mock.calls[1]![1].body;
      expect(createBody.toString()).toContain('mydomain.pstn.twilio.com');
    });
  });

  describe('associateNumberWithTrunk', () => {
    it('sends POST and returns true', async () => {
      mockFetch.mockResolvedValue(mockOk({}));

      const svc = createTwilioService();
      const result = await svc.associateNumberWithTrunk('TK_1', 'PN_1');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://trunking.twilio.com/v1/Trunks/TK_1/PhoneNumbers',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns true for already associated (409)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        text: () => Promise.resolve('already associated'),
      });

      const svc = createTwilioService();
      expect(await svc.associateNumberWithTrunk('TK_1', 'PN_1')).toBe(true);
    });

    it('returns false on other errors', async () => {
      mockFetch.mockResolvedValue(mockError(500));

      const svc = createTwilioService();
      expect(await svc.associateNumberWithTrunk('TK_1', 'PN_1')).toBe(false);
    });
  });

  describe('getPhoneNumberSid', () => {
    it('returns SID for matching number', async () => {
      mockFetch.mockResolvedValue(mockOk({
        incoming_phone_numbers: [{ sid: 'PN_found' }],
      }));

      const svc = createTwilioService();
      const result = await svc.getPhoneNumberSid('+14165551234');

      expect(result).toBe('PN_found');
    });

    it('returns null when number not found', async () => {
      mockFetch.mockResolvedValue(mockOk({
        incoming_phone_numbers: [],
      }));

      const svc = createTwilioService();
      expect(await svc.getPhoneNumberSid('+10000000000')).toBeNull();
    });

    it('returns null on error', async () => {
      mockFetch.mockResolvedValue(mockError(500));

      const svc = createTwilioService();
      expect(await svc.getPhoneNumberSid('+1')).toBeNull();
    });
  });

  describe('authentication', () => {
    it('uses Basic auth with base64 encoded credentials', async () => {
      mockFetch.mockResolvedValue(mockOk({ incoming_phone_numbers: [] }));

      const svc = createTwilioService();
      await svc.listNumbers();

      const headers = mockFetch.mock.calls[0]![1].headers;
      const expectedAuth = `Basic ${Buffer.from('AC_test_sid:test_auth_token').toString('base64')}`;
      expect(headers.Authorization).toBe(expectedAuth);
    });
  });
});
