const mockFetch = jest.fn();
global.fetch = mockFetch;

import { SikkaPmsService } from './sikka.service';
import type { SikkaCredentials } from './types';

const BASE_CREDENTIALS: SikkaCredentials = {
  appId: 'test-app-id',
  appKey: 'test-app-key',
  officeId: 'office-1',
  secretKey: 'secret-1',
  requestKey: 'req-key-valid',
  refreshKey: 'refresh-key-valid',
};

const TOKEN_RESPONSE = {
  ok: true,
  status: 200,
  json: () => Promise.resolve({
    request_key: 'new-req-key',
    refresh_key: 'new-refresh-key',
    expires_in: '86400',
  }),
};

function createService(overrides: Partial<SikkaCredentials> = {}) {
  return new SikkaPmsService('account-123', {
    ...BASE_CREDENTIALS,
    ...overrides,
  });
}

function mockOk(data: any) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

/**
 * Create a service that already has a valid token so the request interceptor
 * doesn't trigger a refresh on the first API call. We achieve this by letting
 * the first call complete (token refresh + one throwaway request), then
 * clearing mocks.
 */
async function createWarmedService(overrides: Partial<SikkaCredentials> = {}) {
  const svc = createService(overrides);
  mockFetch
    .mockResolvedValueOnce(TOKEN_RESPONSE)
    .mockResolvedValueOnce(mockOk({ items: [] }));
  await svc.getProviders();
  mockFetch.mockClear();
  return svc;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SikkaPmsService', () => {
  describe('constructor', () => {
    it('throws if appId is missing', () => {
      expect(() => createService({ appId: '' })).toThrow('Sikka appId and appKey are required');
    });

    it('throws if appKey is missing', () => {
      expect(() => createService({ appKey: '' })).toThrow('Sikka appId and appKey are required');
    });

    it('creates instance with valid credentials', () => {
      const svc = createService();
      expect(svc).toBeInstanceOf(SikkaPmsService);
    });
  });

  describe('getFeatures', () => {
    it('returns all features enabled', async () => {
      const svc = createService();
      const result = await svc.getFeatures();

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        appointments: true,
        patients: true,
        insurance: true,
        payments: true,
        notes: true,
        providers: true,
      });
    });
  });

  describe('updateConfig', () => {
    it('merges new config and returns it', async () => {
      const svc = createService();
      const result = await svc.updateConfig({ defaultAppointmentDuration: 45 });

      expect(result.success).toBe(true);
      expect(result.data!.defaultAppointmentDuration).toBe(45);
    });
  });

  describe('testConnection', () => {
    it('returns success when API responds ok', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({ items: [] }));

      const result = await svc.testConnection();
      expect(result.success).toBe(true);
      expect(result.data!.connectionValid).toBe(true);
    });

    it('returns error when API fails', async () => {
      const svc = await createWarmedService();
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await svc.testConnection();
      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('CONNECTION_FAILED');
    });
  });

  describe('token management', () => {
    it('skips refresh when token is still valid', async () => {
      const svc = await createWarmedService();

      mockFetch.mockResolvedValue(mockOk({ items: [] }));
      await svc.getProviders();

      // Only one call (the actual API request), no token refresh
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('refreshes token using refresh_key when no valid token exists', async () => {
      const svc = createService({
        requestKey: undefined,
        refreshKey: 'my-refresh-key',
      });

      mockFetch
        .mockResolvedValueOnce(TOKEN_RESPONSE)
        .mockResolvedValueOnce(mockOk({ items: [] }));

      await svc.getProviders();

      const firstCall = mockFetch.mock.calls[0]!;
      expect(firstCall[0]).toContain('/request_key');
      const body = JSON.parse(firstCall[1].body);
      expect(body.grant_type).toBe('refresh_key');
    });

    it('fetches authorized practices when no officeId/secretKey', async () => {
      const svc = createService({
        officeId: undefined,
        secretKey: undefined,
        requestKey: undefined,
        refreshKey: undefined,
      });

      mockFetch
        .mockResolvedValueOnce(mockOk({
          items: [{ office_id: 'off-1', secret_key: 'sec-1' }],
        }))
        .mockResolvedValueOnce(TOKEN_RESPONSE)
        .mockResolvedValueOnce(mockOk({ items: [] }));

      await svc.getProviders();

      expect(mockFetch.mock.calls[0]![0]).toContain('/authorized_practices');
      expect(mockFetch.mock.calls[1]![0]).toContain('/request_key');
    });

    it('falls back to getInitialToken when refresh fails with 401', async () => {
      const svc = createService({
        requestKey: undefined,
        refreshKey: 'stale-refresh',
        officeId: 'off-1',
        secretKey: 'sec-1',
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'expired' }),
        })
        .mockResolvedValueOnce(TOKEN_RESPONSE)
        .mockResolvedValueOnce(mockOk({ items: [] }));

      await svc.getProviders();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('getAppointments', () => {
    it('returns mapped appointments', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({
        items: [{
          appointment_id: 'apt-1',
          patient_id: 'p1',
          patient_name: 'John Doe',
          provider_id: 'dr-1',
          provider_name: 'Dr Smith',
          appointment_type: 'Cleaning',
          appointment_date: '2025-03-15T09:00:00Z',
          duration: 30,
          status: 'Scheduled',
        }],
        total_count: '1',
        pagination: { next: '' },
      }));

      const result = await svc.getAppointments({ limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0]!.id).toBe('apt-1');
      expect(result.data![0]!.patientName).toBe('John Doe');
    });

    it('passes filter params to the API', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({ items: [], total_count: '0', pagination: { next: '' } }));

      await svc.getAppointments({
        startDate: new Date('2025-03-01'),
        patientId: 'p1',
        providerId: 'dr-1',
        status: 'Scheduled',
        limit: 5,
        offset: 10,
      });

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('startDate=2025-03-01');
      expect(calledUrl).toContain('patientId=p1');
      expect(calledUrl).toContain('providerId=dr-1');
    });

    it('returns error response on exception', async () => {
      const svc = await createWarmedService();
      mockFetch.mockRejectedValue(new Error('timeout'));

      const result = await svc.getAppointments();
      expect(result.success).toBe(false);
    });
  });

  describe('getAppointment', () => {
    it('returns a single mapped appointment', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({
        appointment_id: 'apt-2',
        patient_id: 'p1',
        provider_id: 'dr-1',
        status: 'Confirmed',
        appointment_date: '2025-03-20T10:00:00Z',
      }));

      const result = await svc.getAppointment('apt-2');
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe('apt-2');
    });
  });

  describe('checkAvailability', () => {
    it('returns available time slots', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({
        items: [
          { start_time: '2025-03-15T09:00:00Z', end_time: '2025-03-15T09:30:00Z', provider_id: 'dr-1', available: true },
          { start_time: '2025-03-15T10:00:00Z', end_time: '2025-03-15T10:30:00Z', provider_id: 'dr-1', available: true },
        ],
      }));

      const result = await svc.checkAvailability({ date: '2025-03-15', duration: 30 });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0]!.available).toBe(true);
    });
  });

  describe('bookAppointment (writeback)', () => {
    it('books and polls writeback to completion', async () => {
      const svc = await createWarmedService();
      mockFetch
        .mockResolvedValueOnce(mockOk({ id: 'wb-1' }))
        .mockResolvedValueOnce(mockOk({ items: [{ id: 'wb-1', result: 'completed' }] }));

      const result = await svc.bookAppointment({
        patientId: 'p1',
        appointmentType: 'Cleaning',
        startTime: new Date('2025-03-20T10:00:00Z'),
        duration: 30,
      });

      expect(result.success).toBe(true);
      expect(result.data!.id).toBe('wb-1');
    });

    it('returns error when writeback fails', async () => {
      const svc = await createWarmedService();
      mockFetch
        .mockResolvedValueOnce(mockOk({ id: 'wb-2' }))
        .mockResolvedValueOnce(mockOk({
          items: [{ id: 'wb-2', result: 'failed', error_message: 'Conflict' }],
        }));

      const result = await svc.bookAppointment({
        patientId: 'p1',
        startTime: new Date('2025-03-20T10:00:00Z'),
      });

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('WRITEBACK_FAILED');
    });
  });

  describe('cancelAppointment (writeback)', () => {
    it('cancels and polls writeback to completion', async () => {
      const svc = await createWarmedService();
      mockFetch
        .mockResolvedValueOnce(mockOk({ id: 'wb-cancel' }))
        .mockResolvedValueOnce(mockOk({
          items: [{ id: 'wb-cancel', result: 'completed' }],
        }));

      const result = await svc.cancelAppointment('apt-1', { reason: 'patient request' });
      expect(result.success).toBe(true);
      expect(result.data!.cancelled).toBe(true);
    });
  });

  describe('searchPatients', () => {
    it('returns mapped patients', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({
        items: [{
          patient_id: 'p1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          mobile_phone: '+14165551234',
          date_of_birth: '1990-01-15',
        }],
        total_count: '1',
        pagination: { next: '' },
      }));

      const result = await svc.searchPatients({ query: 'John' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0]!.firstName).toBe('John');
      expect(result.data![0]!.phone).toBe('+14165551234');
    });
  });

  describe('getPatient', () => {
    it('returns a single mapped patient', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({
        items: [{
          patient_id: 'p1',
          firstname: 'Jane',
          lastname: 'Smith',
          email: 'jane@example.com',
        }],
        total_count: '1',
        pagination: { next: '' },
      }));

      const result = await svc.getPatient('p1');
      expect(result.success).toBe(true);
      expect(result.data!.lastName).toBe('Smith');
    });
  });

  describe('createPatient (writeback)', () => {
    it('creates patient and polls writeback', async () => {
      const svc = await createWarmedService();
      mockFetch
        .mockResolvedValueOnce(mockOk({ id: 'wb-create-p' }))
        .mockResolvedValueOnce(mockOk({
          items: [{ id: 'wb-create-p', result: 'completed' }],
        }));

      const result = await svc.createPatient({
        firstName: 'Alice',
        lastName: 'Wonder',
        dateOfBirth: '1985-06-15',
        phone: '+15551234567',
        email: 'alice@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data!.firstName).toBe('Alice');
    });
  });

  describe('getProviders', () => {
    it('returns mapped providers', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({
        items: [{
          id: 'dr-1',
          first_name: 'Dr',
          last_name: 'Smith',
          specialty: 'General Dentistry',
          is_active: true,
        }],
        total_count: '1',
      }));

      const result = await svc.getProviders();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0]!.lastName).toBe('Smith');
      expect(result.data![0]!.isActive).toBe(true);
    });
  });

  describe('getPatientBalance', () => {
    it('returns mapped balance', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({
        totalBalance: 250,
        insuranceBalance: 100,
        patientBalance: 150,
      }));

      const result = await svc.getPatientBalance('p1');
      expect(result.success).toBe(true);
      expect(result.data!.total).toBe(250);
      expect(result.data!.insurance).toBe(100);
      expect(result.data!.patient).toBe(150);
    });
  });

  describe('processPayment (writeback)', () => {
    it('processes payment and polls writeback', async () => {
      const svc = await createWarmedService();
      mockFetch
        .mockResolvedValueOnce(mockOk({ id: 'wb-pay' }))
        .mockResolvedValueOnce(mockOk({
          items: [{ id: 'wb-pay', result: 'completed' }],
        }));

      const result = await svc.processPayment({
        patientId: 'p1',
        amount: 100,
        method: 'credit_card',
        last4: '4242',
      });

      expect(result.success).toBe(true);
      expect(result.data!.amount).toBe(100);
      expect(result.data!.status).toBe('completed');
    });
  });

  describe('getPatientInsurance', () => {
    it('returns mapped insurance records', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({
        items: [{
          id: 'ins-1',
          patient_id: 'p1',
          provider: 'Delta Dental',
          policy_number: 'POL123',
          group_number: 'GRP456',
          is_primary: true,
        }],
        total_count: '1',
      }));

      const result = await svc.getPatientInsurance('p1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0]!.provider).toBe('Delta Dental');
      expect(result.data![0]!.isPrimary).toBe(true);
    });
  });

  describe('getPatientNotes', () => {
    it('returns mapped notes', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({
        items: [{
          id: 'note-1',
          patient_id: 'p1',
          content: 'Follow up needed',
          category: 'clinical',
          created_at: '2025-03-10T12:00:00Z',
        }],
        total_count: '1',
      }));

      const result = await svc.getPatientNotes('p1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0]!.content).toBe('Follow up needed');
    });
  });

  describe('getPaymentHistory', () => {
    it('returns mapped payment records', async () => {
      const svc = await createWarmedService();
      mockFetch.mockResolvedValue(mockOk({
        items: [{
          transaction_id: 'tx-1',
          patient_id: 'p1',
          amount: 75,
          payment_method: 'credit_card',
          status: 'completed',
          payment_date: '2025-03-05T14:00:00Z',
        }],
        total_count: '1',
      }));

      const result = await svc.getPaymentHistory('p1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0]!.amount).toBe(75);
    });
  });

  describe('rescheduleAppointment (writeback)', () => {
    it('reschedules and polls writeback then fetches updated appointment', async () => {
      const svc = await createWarmedService();
      mockFetch
        .mockResolvedValueOnce(mockOk({ id: 'wb-resched' }))
        .mockResolvedValueOnce(mockOk({
          items: [{ id: 'wb-resched', result: 'completed' }],
        }))
        .mockResolvedValueOnce(mockOk({
          appointment_id: 'apt-1',
          patient_id: 'p1',
          provider_id: 'dr-1',
          status: 'Rescheduled',
          appointment_date: '2025-03-25T11:00:00Z',
        }));

      const result = await svc.rescheduleAppointment('apt-1', {
        startTime: new Date('2025-03-25T11:00:00Z'),
      });

      expect(result.success).toBe(true);
    });
  });

  describe('addPatientNote (writeback)', () => {
    it('adds note and polls writeback', async () => {
      const svc = await createWarmedService();
      mockFetch
        .mockResolvedValueOnce(mockOk({ id: 'wb-note' }))
        .mockResolvedValueOnce(mockOk({
          items: [{ id: 'wb-note', result: 'completed' }],
        }));

      const result = await svc.addPatientNote('p1', {
        content: 'Patient called about billing',
        category: 'billing',
      });

      expect(result.success).toBe(true);
      expect(result.data!.content).toBe('Patient called about billing');
    });
  });

  describe('updatePatient (writeback)', () => {
    it('updates patient and polls writeback then re-fetches', async () => {
      const svc = await createWarmedService();
      mockFetch
        .mockResolvedValueOnce(mockOk({ id: 'wb-update-p' }))
        .mockResolvedValueOnce(mockOk({
          items: [{ id: 'wb-update-p', result: 'completed' }],
        }))
        .mockResolvedValueOnce(mockOk({
          items: [{
            patient_id: 'p1',
            firstname: 'Updated',
            lastname: 'Name',
          }],
          total_count: '1',
          pagination: { next: '' },
        }));

      const result = await svc.updatePatient('p1', { phone: '+15559999999' });
      expect(result.success).toBe(true);
    });
  });
});
