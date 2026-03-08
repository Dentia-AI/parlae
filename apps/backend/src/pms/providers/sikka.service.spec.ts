import { SikkaPmsService } from './sikka.service';
import type { SikkaCredentials } from '../interfaces/pms.types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const VALID_CREDENTIALS: SikkaCredentials = {
  appId: 'test-app-id',
  appKey: 'test-app-key',
  requestKey: 'req-key-123',
  refreshKey: 'refresh-key-456',
  officeId: 'office-1',
  secretKey: 'secret-1',
  practiceId: '1',
};

const TOKEN_RESPONSE = {
  request_key: 'new-request-key',
  refresh_key: 'new-refresh-key',
  expires_in: '86400 second(s)',
};

const AUTHORIZED_PRACTICES_RESPONSE = {
  items: [{ office_id: 'office-1', secret_key: 'secret-1' }],
};

function createMockClient() {
  let requestHandler: ((config: any) => Promise<any>) | null = null;

  const mockGet = jest.fn();
  const mockPost = jest.fn();
  const mockPatch = jest.fn();
  const mockPut = jest.fn();
  const mockDelete = jest.fn();

  const client = {
    get: jest.fn(async (url: string, config: any = {}) => {
      const cfg = { method: 'GET', url, headers: {}, ...config };
      if (requestHandler) {
        await requestHandler(cfg);
      }
      return mockGet(url, config);
    }),
    post: jest.fn(async (url: string, data?: any, config: any = {}) => {
      const cfg = { method: 'POST', url, data, headers: {}, ...config };
      if (requestHandler) {
        await requestHandler(cfg);
      }
      return mockPost(url, data, config);
    }),
    patch: jest.fn(async (url: string, data?: any, config: any = {}) => {
      const cfg = { method: 'PATCH', url, data, headers: {}, ...config };
      if (requestHandler) {
        await requestHandler(cfg);
      }
      return mockPatch(url, data, config);
    }),
    put: jest.fn(async (url: string, data?: any, config: any = {}) => {
      const cfg = { method: 'PUT', url, data, headers: {}, ...config };
      if (requestHandler) {
        await requestHandler(cfg);
      }
      return mockPut(url, data, config);
    }),
    delete: jest.fn(async (url: string, config: any = {}) => {
      const cfg = { method: 'DELETE', url, headers: {}, ...config };
      if (requestHandler) {
        await requestHandler(cfg);
      }
      return mockDelete(url, config);
    }),
    interceptors: {
      request: {
        use: jest.fn((onFulfilled: (config: any) => Promise<any>) => {
          requestHandler = onFulfilled;
          return 0;
        }),
      },
      response: {
        use: jest.fn(),
      },
    },
  };

  return { client, mockGet, mockPost, mockPatch, mockPut, mockDelete };
}

describe('SikkaPmsService', () => {
  let service: SikkaPmsService;
  let mockGet: jest.Mock;
  let mockPost: jest.Mock;
  let mockPatch: jest.Mock;
  let mockPut: jest.Mock;
  let mockDelete: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    const { client, mockGet: mg, mockPost: mp, mockPatch: mpa, mockPut: mpu, mockDelete: md } = createMockClient();
    mockGet = mg;
    mockPost = mp;
    mockPatch = mpa;
    mockPut = mpu;
    mockDelete = md;

    mockedAxios.create.mockReturnValue(client as any);

    // Token flow mocks - used by ensureValidToken
    mockedAxios.get.mockImplementation(async (url: string, config?: any) => {
      if (url.includes('authorized_practices')) {
        return { data: AUTHORIZED_PRACTICES_RESPONSE };
      }
      throw new Error(`Unexpected axios.get: ${url}`);
    });

    mockedAxios.post.mockImplementation(async (url: string, data?: any) => {
      if (url.includes('request_key')) {
        return { data: TOKEN_RESPONSE };
      }
      throw new Error(`Unexpected axios.post: ${url}`);
    });
  });

  describe('Constructor', () => {
    it('throws when appId is missing', () => {
      expect(() => {
        new SikkaPmsService('acc-1', { appKey: 'key' } as SikkaCredentials, {});
      }).toThrow('Sikka appId and appKey are required');
    });

    it('throws when appKey is missing', () => {
      expect(() => {
        new SikkaPmsService('acc-1', { appId: 'id' } as SikkaCredentials, {});
      }).toThrow('Sikka appId and appKey are required');
    });

    it('throws when both appId and appKey are missing', () => {
      expect(() => {
        new SikkaPmsService('acc-1', {} as SikkaCredentials, {});
      }).toThrow('Sikka appId and appKey are required');
    });

    it('creates service and sets up client when credentials are valid', () => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.sikkasoft.com/v4',
          timeout: 20000,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })
      );
      expect(service).toBeDefined();
    });
  });

  describe('getFeatures', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('returns feature object with all capabilities enabled', async () => {
      const result = await service.getFeatures();

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

  describe('testConnection', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('returns success when API responds', async () => {
      mockGet.mockResolvedValue({ data: { items: [] } });

      const result = await service.testConnection();

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        connectionValid: true,
        message: 'Successfully connected to Sikka API',
      });
      expect(mockGet).toHaveBeenCalledWith('/appointments', { params: { limit: 1 } });
    });

    it('returns failure when API throws', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      const result = await service.testConnection();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONNECTION_FAILED');
      expect(result.error?.message).toContain('Failed to connect to Sikka API');
    });
  });

  describe('getAppointments', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('calls API with date range and status params', async () => {
      const startDate = new Date('2025-03-01');
      const endDate = new Date('2025-03-31');
      mockGet.mockResolvedValue({
        data: {
          items: [],
          total_count: '0',
          pagination: { next: '' },
        },
      });

      await service.getAppointments({
        startDate,
        endDate,
        status: 'scheduled',
        limit: 20,
        offset: 0,
      });

      expect(mockGet).toHaveBeenCalledWith('/appointments', {
        params: expect.objectContaining({
          startdate: '2025-03-01',
          enddate: '2025-03-31',
          practice_id: '1',
          limit: 20,
          offset: 0,
        }),
      });
    });

    it('transforms response and returns list', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [
            {
              appointment_sr_no: 'apt-1',
              patient_id: 'pat-1',
              patient_name: 'John Doe',
              provider_id: 'prov-1',
              provider_name: 'Dr Smith',
              type: 'Checkup',
              date: '2025-03-15',
              time: '10:00',
              length: '30',
              status: 'scheduled',
              note: 'Regular visit',
            },
          ],
          total_count: '1',
          pagination: { next: '' },
        },
      });

      const result = await service.getAppointments();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0]).toMatchObject({
        id: 'apt-1',
        patientId: 'pat-1',
        patientName: 'John Doe',
        providerId: 'prov-1',
        providerName: 'Dr Smith',
        appointmentType: 'Checkup',
        status: 'scheduled',
        duration: 30,
      });
    });

    it('handles API errors', async () => {
      mockGet.mockRejectedValue({ response: { status: 500, data: { message: 'Server error' } } });

      const result = await service.getAppointments();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HTTP_500');
    });
  });

  describe('searchPatients / getPatient', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('searchPatients calls API and transforms response', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [
            {
              patient_id: 'pat-1',
              firstname: 'Jane',
              lastname: 'Doe',
              email: 'jane@example.com',
              cell: '555-1234',
            },
          ],
          total_count: '1',
          pagination: { next: '' },
        },
      });

      const result = await service.searchPatients({ query: 'Jane Doe', limit: 10, offset: 0 });

      expect(mockGet).toHaveBeenCalledWith('/patients', {
        params: { firstname: 'Jane', lastname: 'Doe', limit: 10, offset: 0 },
      });
      expect(result.success).toBe(true);
      expect(result.data![0]).toMatchObject({
        id: 'pat-1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: '+5551234',
      });
    });

    it('searchPatients handles errors', async () => {
      mockGet.mockRejectedValue(new Error('Search failed'));

      const result = await service.searchPatients({ query: 'x' });

      expect(result.success).toBe(false);
    });

    it('getPatient fetches and transforms patient', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [
            {
              patient_id: 'pat-1',
              firstname: 'Jane',
              lastname: 'Doe',
              birthdate: '1990-01-15',
              email: 'jane@example.com',
            },
          ],
          total_count: '1',
        },
      });

      const result = await service.getPatient('pat-1');

      expect(mockGet).toHaveBeenCalledWith('/patients', {
        params: { patient_id: 'pat-1', limit: 1, practice_id: '1' },
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: 'pat-1',
        firstName: 'Jane',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        email: 'jane@example.com',
      });
    });
  });

  describe('createPatient', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('sends correct payload to API', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-1', more_information: 'https://api.sikkasoft.com/v4/writeback_status?id=wb-1' } });
      mockGet.mockResolvedValue({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Patient created' }] } });

      await service.createPatient({
        firstName: 'John',
        lastName: 'Smith',
        dateOfBirth: '1985-05-20',
        phone: '555-9999',
        email: 'john@example.com',
        address: { street: '123 Main St', city: 'Boston', state: 'MA', zip: '02101' },
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/patient',
        expect.objectContaining({
          firstname: 'John',
          lastname: 'Smith',
          birthdate: '1985-05-20',
          cell: '555-9999',
          email: 'john@example.com',
          practice_id: '1',
          address_line1: '123 Main St',
          city: 'Boston',
          state: 'MA',
          zipcode: '02101',
        }),
        expect.anything()
      );
    });

    it('returns patient on writeback completed', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet.mockResolvedValue({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Patient created' }] } });

      const result = await service.createPatient({
        firstName: 'John',
        lastName: 'Smith',
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: 'wb-1',
        firstName: 'John',
        lastName: 'Smith',
      });
    });

    it('returns error when writeback fails', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet.mockResolvedValue({
        data: { items: [{ is_completed: 'True', has_error: 'True', result: 'Duplicate patient' }] },
      });

      const result = await service.createPatient({
        firstName: 'John',
        lastName: 'Smith',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('WRITEBACK_FAILED');
      expect(result.error?.message).toContain('Duplicate patient');
    });
  });

  describe('bookAppointment', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('creates appointment with correct payload', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-apt-1' } });
      mockGet.mockResolvedValue({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Appointment created' }] } });
      const startTime = new Date('2025-03-15T14:00:00Z');

      const result = await service.bookAppointment({
        patientId: 'pat-1',
        providerId: 'prov-1',
        appointmentType: 'Checkup',
        startTime,
        duration: 30,
        notes: 'Annual checkup',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/appointment',
        expect.objectContaining({
          patient_id: 'pat-1',
          provider_id: 'prov-1',
          date: '2025-03-15',
          length: '30',
          note: 'Annual checkup',
          type: 'Checkup',
          practice_id: '1',
        }),
        expect.anything()
      );
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        patientId: 'pat-1',
        providerId: 'prov-1',
        appointmentType: 'Checkup',
        status: 'scheduled',
      });
    });
  });

  describe('getPatientBalance', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('fetches and returns balance', async () => {
      mockGet.mockResolvedValue({
        data: {
          total: 150,
          patient: 100,
          insurance: 50,
        },
      });

      const result = await service.getPatientBalance('pat-1');

      expect(mockGet).toHaveBeenCalledWith('/patient_balance', {
        params: { patient_id: 'pat-1' },
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        total: 150,
        patient: 100,
        insurance: 50,
      });
    });
  });

  describe('getPatientInsurance', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('fetches insurance records', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [
            {
              id: 'ins-1',
              patient_id: 'pat-1',
              provider: 'Blue Cross',
              policy_number: 'POL123',
              group_number: 'GRP456',
              is_primary: true,
            },
          ],
          total_count: '1',
        },
      });

      const result = await service.getPatientInsurance('pat-1');

      expect(mockGet).toHaveBeenCalledWith('/insurance_plan_coverage', {
        params: { patient_id: 'pat-1' },
      });
      expect(result.success).toBe(true);
      expect(result.data![0]).toMatchObject({
        id: 'ins-1',
        patientId: 'pat-1',
        provider: 'Blue Cross',
        policyNumber: 'POL123',
        groupNumber: 'GRP456',
        isPrimary: true,
      });
    });
  });

  describe('processPayment', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('sends payment data and returns on completion', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-pay-1' } });
      mockGet.mockResolvedValue({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Payment completed' }] } });

      const result = await service.processPayment({
        patientId: 'pat-1',
        amount: 75.5,
        method: 'credit_card',
        last4: '4242',
        notes: 'Copay',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/transaction',
        expect.objectContaining({
          patient_id: 'pat-1',
          amount: 75.5,
          method: 'credit_card',
          last4: '4242',
          notes: 'Copay',
        }),
        expect.anything()
      );
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        patientId: 'pat-1',
        amount: 75.5,
        method: 'credit_card',
        status: 'completed',
      });
    });
  });

  describe('Token management', () => {
    it('ensureValidToken is invoked via request interceptor on each request', async () => {
      // Use credentials without requestKey so ensureValidToken will call fetchAuthorizedPractices + getInitialToken
      service = new SikkaPmsService('acc-1', {
        appId: 'test-app-id',
        appKey: 'test-app-key',
      });

      mockGet.mockResolvedValue({ data: { items: [] } });

      await service.getAppointments();

      // ensureValidToken triggers: fetchAuthorizedPractices (axios.get) -> getInitialToken (axios.post)
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.sikkasoft.com/v4/authorized_practices',
        expect.any(Object)
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.sikkasoft.com/v4/request_key',
        expect.objectContaining({
          grant_type: 'request_key',
          office_id: 'office-1',
          secret_key: 'secret-1',
        }),
        expect.any(Object)
      );
      expect(mockGet).toHaveBeenCalledWith('/appointments', expect.any(Object));
    });

    it('uses refreshKey when available for token refresh', async () => {
      service = new SikkaPmsService('acc-1', {
        appId: 'test-app-id',
        appKey: 'test-app-key',
        refreshKey: 'refresh-key-123',
        officeId: 'office-1',
        secretKey: 'secret-1',
      });

      mockGet.mockResolvedValue({ data: { items: [] } });

      await service.getAppointments();

      // Should use refresh_key grant first (no tokenExpiry set initially)
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.sikkasoft.com/v4/request_key',
        expect.objectContaining({
          grant_type: 'refresh_key',
          refresh_key: 'refresh-key-123',
        }),
        expect.any(Object)
      );
    });

    it('falls back to getInitialToken when refresh_key returns 401', async () => {
      service = new SikkaPmsService('acc-1', {
        appId: 'test-app-id',
        appKey: 'test-app-key',
        refreshKey: 'expired-refresh',
        officeId: 'office-1',
        secretKey: 'secret-1',
      });

      const axiosError = Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        response: { status: 401 },
      });
      (mockedAxios as any).isAxiosError = jest.fn((e: unknown) => (e as any)?.isAxiosError === true);
      mockedAxios.post
        .mockRejectedValueOnce(axiosError)
        .mockResolvedValueOnce({ data: TOKEN_RESPONSE });
      mockGet.mockResolvedValue({ data: { items: [] } });

      await service.getAppointments();

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        1,
        'https://api.sikkasoft.com/v4/request_key',
        expect.objectContaining({ grant_type: 'refresh_key' }),
        expect.any(Object)
      );
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        2,
        'https://api.sikkasoft.com/v4/request_key',
        expect.objectContaining({
          grant_type: 'request_key',
          office_id: 'office-1',
          secret_key: 'secret-1',
        }),
        expect.any(Object)
      );
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('returns CONNECTION_REFUSED for ECONNREFUSED', async () => {
      mockGet.mockRejectedValue({ code: 'ECONNREFUSED', message: 'Connection refused' });

      const result = await service.getAppointments();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONNECTION_REFUSED');
    });

    it('returns TIMEOUT for ETIMEDOUT', async () => {
      mockGet.mockRejectedValue({ code: 'ETIMEDOUT', message: 'Timeout' });

      const result = await service.getAppointments();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
    });
  });

  describe('updateConfig', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('merges config and returns updated config', async () => {
      const result = await service.updateConfig({
        defaultAppointmentDuration: 45,
        timezone: 'America/New_York',
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        defaultAppointmentDuration: 45,
        timezone: 'America/New_York',
      });
    });
  });

  describe('getAppointment', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('fetches single appointment', async () => {
      mockGet.mockResolvedValue({
        data: {
          appointment_sr_no: 'apt-1',
          patient_id: 'pat-1',
          provider_id: 'prov-1',
          date: '2025-03-15',
          time: '10:00',
          length: '30',
          status: 'confirmed',
        },
      });

      const result = await service.getAppointment('apt-1');

      expect(mockGet).toHaveBeenCalledWith('/appointments/apt-1', expect.anything());
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('apt-1');
    });
  });

  describe('checkAvailability', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('fetches available slots', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [
            {
              date: '2025-03-15',
              time: '09:00',
              length: '30',
              provider_id: 'prov-1',
              practice_id: '1',
            },
          ],
        },
      });

      const result = await service.checkAvailability({
        date: '2025-03-15',
        duration: 30,
        providerId: 'prov-1',
      });

      expect(mockGet).toHaveBeenCalledWith('/appointments_available_slots', {
        params: expect.objectContaining({
          startdate: '2025-03-15',
          provider_id: 'prov-1',
          practice_id: '1',
        }),
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('rescheduleAppointment', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('updates appointment and returns result', async () => {
      mockPut.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet.mockResolvedValueOnce({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Updated' }] } })
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                appointment_sr_no: 'apt-1',
                patient_id: 'pat-1',
                provider_id: 'prov-1',
                date: '2025-03-16',
                time: '14:00',
                length: '45',
                status: 'scheduled',
              },
            ],
          },
        });

      const result = await service.rescheduleAppointment('apt-1', {
        startTime: new Date('2025-03-16T14:00:00Z'),
        duration: 45,
      });

      expect(mockPut).toHaveBeenCalledWith(
        '/appointments/apt-1',
        expect.objectContaining({
          date: '2025-03-16',
          time: '14:00',
          length: '45',
          practice_id: '1',
        }),
        expect.anything()
      );
      expect(result.success).toBe(true);
    });
  });

  describe('cancelAppointment', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('cancels appointment with reason', async () => {
      mockPatch.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet.mockResolvedValue({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Cancelled' }] } });

      const result = await service.cancelAppointment('apt-1', { reason: 'Patient request' });

      expect(mockPatch).toHaveBeenCalledWith(
        '/appointments/apt-1',
        expect.objectContaining({
          appointment_sr_no: 'apt-1',
          op: 'replace',
          path: '/status',
          value: 'Cancelled',
          practice_id: '1',
          cancellation_note: 'Patient request',
        }),
        expect.anything()
      );
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ cancelled: true });
    });
  });

  describe('updatePatient', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('patches patient and returns updated', async () => {
      mockPatch.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet.mockResolvedValueOnce({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Updated' }] } })
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                patient_id: 'pat-1',
                firstname: 'Jane',
                lastname: 'Doe',
                email: 'jane.updated@example.com',
              },
            ],
          },
        });

      const result = await service.updatePatient('pat-1', {
        email: 'jane.updated@example.com',
      });

      expect(mockPatch).toHaveBeenCalledWith(
        '/patient/pat-1',
        { email: 'jane.updated@example.com' },
        expect.anything()
      );
      expect(result.success).toBe(true);
      expect(result.data?.email).toBe('jane.updated@example.com');
    });
  });

  describe('getPatientNotes', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('fetches notes', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [
            {
              id: 'note-1',
              patient_id: 'pat-1',
              content: 'Allergic to penicillin',
              category: 'allergy',
              created_at: '2025-01-01T00:00:00Z',
            },
          ],
          total_count: '1',
        },
      });

      const result = await service.getPatientNotes('pat-1');

      expect(mockGet).toHaveBeenCalledWith('/medical_notes', {
        params: { patient_id: 'pat-1' },
      });
      expect(result.success).toBe(true);
      expect(result.data![0]).toMatchObject({
        id: 'note-1',
        patientId: 'pat-1',
        content: 'Allergic to penicillin',
        category: 'allergy',
      });
    });
  });

  describe('addPatientNote', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('creates note via writeback', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet.mockResolvedValue({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Note created' }] } });

      const result = await service.addPatientNote('pat-1', {
        content: 'Follow-up needed',
        category: 'general',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/medical_notes',
        expect.objectContaining({
          patient_id: 'pat-1',
          content: 'Follow-up needed',
          category: 'general',
        }),
        expect.anything()
      );
      expect(result.success).toBe(true);
      expect(result.data?.content).toBe('Follow-up needed');
    });
  });

  describe('addPatientInsurance', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('returns NOT_SUPPORTED since Sikka does not support direct insurance creation', async () => {
      const result = await service.addPatientInsurance('pat-1', {
        provider: 'Aetna',
        policyNumber: 'POL789',
        isPrimary: true,
      });

      expect(mockPost).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_SUPPORTED');
    });
  });

  describe('getProviders', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('fetches providers list', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [
            {
              id: 'prov-1',
              first_name: 'John',
              last_name: 'Smith',
              title: 'DDS',
              specialty: 'General',
            },
          ],
          total_count: '1',
        },
      });

      const result = await service.getProviders();

      expect(mockGet).toHaveBeenCalledWith('/providers', expect.anything());
      expect(result.success).toBe(true);
      expect(result.data![0]).toMatchObject({
        id: 'prov-1',
        firstName: 'John',
        lastName: 'Smith',
        title: 'DDS',
        specialty: 'General',
      });
    });
  });

  describe('getProvider', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('fetches single provider', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [
            {
              id: 'prov-1',
              first_name: 'John',
              last_name: 'Smith',
              title: 'DDS',
            },
          ],
        },
      });

      const result = await service.getProvider('prov-1');

      expect(mockGet).toHaveBeenCalledWith('/providers', {
        params: { provider_id: 'prov-1', limit: 1 },
      });
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('prov-1');
    });
  });

  describe('getPaymentHistory', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('fetches payment history', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [
            {
              id: 'pay-1',
              patient_id: 'pat-1',
              amount: 50,
              method: 'credit_card',
              status: 'completed',
              payment_date: '2025-02-01T00:00:00Z',
            },
          ],
          total_count: '1',
        },
      });

      const result = await service.getPaymentHistory('pat-1');

      expect(mockGet).toHaveBeenCalledWith('/transactions', {
        params: { patient_id: 'pat-1' },
      });
      expect(result.success).toBe(true);
      expect(result.data![0]).toMatchObject({
        id: 'pay-1',
        patientId: 'pat-1',
        amount: 50,
        method: 'credit_card',
      });
    });
  });

  describe('updatePatientInsurance', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('returns NOT_SUPPORTED since Sikka does not support direct insurance updates', async () => {
      const result = await service.updatePatientInsurance('pat-1', 'ins-1', {
        policyNumber: 'POL-UPDATED',
      });

      expect(mockPatch).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_SUPPORTED');
    });
  });
});
