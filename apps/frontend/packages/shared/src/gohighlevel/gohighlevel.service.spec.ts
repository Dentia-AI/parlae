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
    GHL_API_KEY: 'test-api-key',
    GHL_LOCATION_ID: 'loc-123',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

import { createGoHighLevelService } from './gohighlevel.service';

describe('GoHighLevelService', () => {
  describe('isEnabled', () => {
    it('returns true when API key and location ID are configured', () => {
      const svc = createGoHighLevelService();
      expect(svc.isEnabled()).toBe(true);
    });

    it('returns false when API key is missing', () => {
      process.env.GHL_API_KEY = '';
      const svc = createGoHighLevelService();
      expect(svc.isEnabled()).toBe(false);
    });

    it('returns false when location ID is missing', () => {
      process.env.GHL_LOCATION_ID = '';
      const svc = createGoHighLevelService();
      expect(svc.isEnabled()).toBe(false);
    });
  });

  describe('upsertContact', () => {
    it('returns null and logs warning when service is disabled', async () => {
      process.env.GHL_API_KEY = '';
      const svc = createGoHighLevelService();

      const result = await svc.upsertContact({ email: 'test@example.com' });
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends correct payload and returns contact ID on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          contact: { id: 'contact-1', email: 'test@example.com', name: 'Test', tags: ['tag1'] },
        }),
      });

      const svc = createGoHighLevelService();
      const result = await svc.upsertContact({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+14165551234',
        tags: ['tag1'],
        source: 'test',
      });

      expect(result).toBe('contact-1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://services.leadconnectorhq.com/contacts/upsert');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.locationId).toBe('loc-123');
      expect(body.email).toBe('test@example.com');
      expect(body.firstName).toBe('John');
      expect(body.lastName).toBe('Doe');
      expect(body.phone).toBe('+14165551234');
      expect(body.tags).toEqual(['tag1']);
      expect(body.source).toBe('test');

      expect(options.headers.Authorization).toBe('Bearer test-api-key');
    });

    it('splits a full name into firstName and lastName', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ contact: { id: 'c-2' } }),
      });

      const svc = createGoHighLevelService();
      await svc.upsertContact({ email: 'a@b.com', name: 'John Michael Doe' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.firstName).toBe('John');
      expect(body.lastName).toBe('Michael Doe');
    });

    it('returns null on API error (does not throw)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Bad request' }),
      });

      const svc = createGoHighLevelService();
      const result = await svc.upsertContact({ email: 'test@example.com' });
      expect(result).toBeNull();
    });

    it('returns null on fetch exception (does not throw)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const svc = createGoHighLevelService();
      const result = await svc.upsertContact({ email: 'test@example.com' });
      expect(result).toBeNull();
    });

    it('omits optional fields from payload when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ contact: { id: 'c-3' } }),
      });

      const svc = createGoHighLevelService();
      await svc.upsertContact({ email: 'minimal@test.com' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.phone).toBeUndefined();
      expect(body.tags).toBeUndefined();
      expect(body.customFields).toBeUndefined();
      expect(body.source).toBeUndefined();
    });
  });

  describe('syncRegisteredUser', () => {
    it('adds "registered user" tag and syncs contact', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ contact: { id: 'c-sync' } }),
      });

      const svc = createGoHighLevelService();
      const result = await svc.syncRegisteredUser({
        email: 'new@user.com',
        displayName: 'Jane Smith',
      });

      expect(result).toBe('c-sync');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tags).toContain('registered user');
      expect(body.source).toBe('Parlae App Registration');
    });

    it('adds domain-based tags when hostname is provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ contact: { id: 'c-dom' } }),
      });

      const svc = createGoHighLevelService();
      await svc.syncRegisteredUser({
        email: 'test@user.com',
        hostname: 'hub.parlae.ca',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tags).toContain('registered user');
      expect(body.tags).toContain('hub-signup');
      expect(body.tags).toContain('domain-parlae-ca');
    });

    it('tags www hostname as main-app-signup', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ contact: { id: 'c-www' } }),
      });

      const svc = createGoHighLevelService();
      await svc.syncRegisteredUser({
        email: 'test@user.com',
        hostname: 'www.parlae.com',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tags).toContain('main-app-signup');
      expect(body.tags).toContain('domain-parlae-com');
    });
  });

  describe('addContactTags', () => {
    it('returns null when no tags provided', async () => {
      const svc = createGoHighLevelService();
      const result = await svc.addContactTags({ email: 'a@b.com', tags: [] });
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('upserts contact with specified tags', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ contact: { id: 'c-tag' } }),
      });

      const svc = createGoHighLevelService();
      const result = await svc.addContactTags({
        email: 'a@b.com',
        tags: ['vip', 'premium'],
        source: 'upgrade',
      });

      expect(result).toBe('c-tag');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tags).toEqual(['vip', 'premium']);
      expect(body.source).toBe('upgrade');
    });
  });

  describe('getVoices', () => {
    it('returns empty array when service is disabled', async () => {
      process.env.GHL_API_KEY = '';
      const svc = createGoHighLevelService();
      const voices = await svc.getVoices();
      expect(voices).toEqual([]);
    });

    it('returns a curated list of voices when enabled', async () => {
      const svc = createGoHighLevelService();
      const voices = await svc.getVoices();

      expect(voices.length).toBeGreaterThan(0);
      for (const voice of voices) {
        expect(voice.id).toBeTruthy();
        expect(voice.name).toBeTruthy();
        expect(['male', 'female']).toContain(voice.gender);
        expect(voice.language).toBeTruthy();
      }
    });
  });

  describe('getActivePhoneNumbers', () => {
    it('returns empty array when service is disabled', async () => {
      process.env.GHL_API_KEY = '';
      const svc = createGoHighLevelService();
      const numbers = await svc.getActivePhoneNumbers();
      expect(numbers).toEqual([]);
    });

    it('fetches and maps phone numbers from the API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          numbers: [
            {
              phoneNumber: '+14165551000',
              friendlyName: 'Main Line',
              city: 'Toronto',
              state: 'ON',
              capabilities: ['Voice', 'SMS'],
            },
          ],
        }),
      });

      const svc = createGoHighLevelService();
      const numbers = await svc.getActivePhoneNumbers();

      expect(numbers).toHaveLength(1);
      expect(numbers[0]!.phoneNumber).toBe('+14165551000');
      expect(numbers[0]!.friendlyName).toBe('Main Line');
      expect(numbers[0]!.city).toBe('Toronto');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://services.leadconnectorhq.com/phone-system/numbers/location/loc-123',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns empty array on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Server Error'),
      });

      const svc = createGoHighLevelService();
      const numbers = await svc.getActivePhoneNumbers();
      expect(numbers).toEqual([]);
    });

    it('returns empty array on exception', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const svc = createGoHighLevelService();
      const numbers = await svc.getActivePhoneNumbers();
      expect(numbers).toEqual([]);
    });
  });

  describe('getNumberPools', () => {
    it('returns empty array when disabled', async () => {
      process.env.GHL_API_KEY = '';
      const svc = createGoHighLevelService();
      const pools = await svc.getNumberPools();
      expect(pools).toEqual([]);
    });

    it('fetches and maps number pools', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          numberPools: [
            { id: 'pool-1', name: 'Sales Pool', numbers: ['+1111', '+2222'], locationIds: ['loc-123'] },
          ],
        }),
      });

      const svc = createGoHighLevelService();
      const pools = await svc.getNumberPools();

      expect(pools).toHaveLength(1);
      expect(pools[0]!.id).toBe('pool-1');
      expect(pools[0]!.name).toBe('Sales Pool');
      expect(pools[0]!.numbers).toEqual(['+1111', '+2222']);
    });
  });

  describe('getPhoneNumbersForLocations', () => {
    it('returns empty object when disabled', async () => {
      process.env.GHL_API_KEY = '';
      const svc = createGoHighLevelService();
      const result = await svc.getPhoneNumbersForLocations(['loc-1']);
      expect(result).toEqual({});
    });

    it('fetches numbers for multiple locations in parallel', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            numbers: [{ phoneNumber: '+100', friendlyName: 'Loc1' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            numbers: [{ phoneNumber: '+200', friendlyName: 'Loc2' }],
          }),
        });

      const svc = createGoHighLevelService();
      const result = await svc.getPhoneNumbersForLocations(['loc-a', 'loc-b']);

      expect(result['loc-a']).toHaveLength(1);
      expect(result['loc-b']).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns empty array for a location that fails', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ numbers: [{ phoneNumber: '+100' }] }),
        });

      const svc = createGoHighLevelService();
      const result = await svc.getPhoneNumbersForLocations(['loc-bad', 'loc-ok']);

      expect(result['loc-bad']).toEqual([]);
      expect(result['loc-ok']).toHaveLength(1);
    });
  });
});
