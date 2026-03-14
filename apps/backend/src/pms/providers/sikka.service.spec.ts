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
          description: 'Checkup',
          practice_id: '1',
        }),
        expect.anything()
      );
      const sentPayload = mockPost.mock.calls[0][1];
      expect(sentPayload.type).toBeUndefined();
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        patientId: 'pat-1',
        providerId: 'prov-1',
        appointmentType: 'Checkup',
        status: 'scheduled',
      });
    });

    it('always includes description even when only appointmentType is set', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-apt-2' } });
      mockGet.mockResolvedValue({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Created' }] } });

      await service.bookAppointment({
        patientId: 'pat-1',
        appointmentType: 'cleaning',
        startTime: new Date('2025-03-15T14:00:00Z'),
        duration: 30,
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/appointment',
        expect.objectContaining({ description: 'cleaning' }),
        expect.anything(),
      );
    });

    it('uses "Appointment" as description fallback when no type or notes', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-apt-3' } });
      mockGet.mockResolvedValue({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Created' }] } });

      await service.bookAppointment({
        patientId: 'pat-1',
        appointmentType: '',
        startTime: new Date('2025-03-15T14:00:00Z'),
        duration: 30,
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/appointment',
        expect.objectContaining({ description: 'Appointment' }),
        expect.anything(),
      );
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
      mockGet
        .mockResolvedValueOnce({ data: { items: [{ provider_id: 'DOC1', firstname: 'Doc', lastname: 'One', status: 'active' }] } })
        .mockResolvedValueOnce({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Updated' }] } })
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                appointment_sr_no: 'apt-1',
                patient_id: 'pat-1',
                provider_id: 'DOC1',
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
          provider_id: 'DOC1',
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

    it('resolves cancel status from practice_variables (OpenDental: broken)', async () => {
      mockGet
        .mockResolvedValueOnce({
          data: { items: [
            { service_item: 'appointment status', value: 'scheduled' },
            { service_item: 'appointment status', value: 'complete' },
            { service_item: 'appointment status', value: 'broken' },
            { service_item: 'appointment confirmed status', value: 'Confirmed' },
          ] },
        })
        .mockResolvedValueOnce({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'broken' }] } });
      mockPatch.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });

      const result = await service.cancelAppointment('apt-1', { reason: 'Patient request' });

      expect(mockPatch).toHaveBeenCalledWith(
        '/appointments/apt-1',
        expect.objectContaining({
          op: 'replace',
          path: '/appointment_status',
          value: 'broken',
          cancellation_note: 'Patient request',
        }),
        expect.anything()
      );
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ cancelled: true });
    });

    it('resolves cancel status for PMS that uses "Cancelled" instead of "broken"', async () => {
      mockGet
        .mockResolvedValueOnce({
          data: { items: [
            { service_item: 'appointment status', value: 'Scheduled' },
            { service_item: 'appointment status', value: 'Complete' },
            { service_item: 'appointment status', value: 'Cancelled' },
          ] },
        })
        .mockResolvedValueOnce({ data: { items: [{ is_completed: 'True', has_error: 'False' }] } });
      mockPatch.mockResolvedValue({ data: { long_message: 'Id:wb-2' } });

      const result = await service.cancelAppointment('apt-2', { reason: 'No longer needed' });

      expect(mockPatch).toHaveBeenCalledWith(
        '/appointments/apt-2',
        expect.objectContaining({ value: 'Cancelled' }),
        expect.anything()
      );
      expect(result.success).toBe(true);
    });

    it('falls back to "broken" when practice_variables API fails', async () => {
      mockGet
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: { items: [{ is_completed: 'True', has_error: 'False' }] } });
      mockPatch.mockResolvedValue({ data: { long_message: 'Id:wb-3' } });

      const result = await service.cancelAppointment('apt-3', { reason: 'Fallback test' });

      expect(mockPatch).toHaveBeenCalledWith(
        '/appointments/apt-3',
        expect.objectContaining({ value: 'broken' }),
        expect.anything()
      );
      expect(result.success).toBe(true);
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
        expect.objectContaining({ email: 'jane.updated@example.com', practice_id: '1' }),
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

  describe('getProviders — Sikka lowercase field names', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('maps Sikka lowercase firstname/lastname to camelCase', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [
            {
              provider_id: 'HYG2',
              firstname: 'Bruce',
              lastname: 'Bently',
              status: 'active',
              specialty_code: '124Q00000X',
              practice_id: '1',
            },
          ],
          total_count: '1',
        },
      });

      const result = await service.getProviders();

      expect(result.success).toBe(true);
      expect(result.data![0]).toMatchObject({
        id: 'HYG2',
        firstName: 'Bruce',
        lastName: 'Bently',
        isActive: true,
      });
    });

    it('marks provider inactive when status is "inactive"', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [
            {
              provider_id: 'DOC1',
              firstname: 'Jane',
              lastname: 'Doe',
              status: 'inactive',
            },
          ],
          total_count: '1',
        },
      });

      const result = await service.getProviders();

      expect(result.data![0].isActive).toBe(false);
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

  describe('searchPatients — multi-phone fallback', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('returns patient found by cell (no fallback needed)', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [{ patient_id: 'pat-1', firstname: 'Jane', lastname: 'Doe', cell: '5551234' }],
          total_count: '1',
          pagination: { next: '' },
        },
      });

      const result = await service.searchPatients({ query: '5551234' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('pat-1');
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('falls back to homephone/workphone search when cell returns empty', async () => {
      mockGet
        .mockResolvedValueOnce({ data: { items: [], total_count: '0', pagination: { next: '' } } })
        .mockResolvedValueOnce({
          data: {
            items: [
              { patient_id: 'pat-2', firstname: 'Bob', lastname: 'Smith', cell: '', homephone: '5858578357', workphone: '' },
              { patient_id: 'pat-3', firstname: 'Alice', lastname: 'Brown', cell: '1112223333', homephone: '', workphone: '' },
            ],
            total_count: '2',
            pagination: { next: '' },
          },
        });

      const result = await service.searchPatients({ query: '5858578357' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('pat-2');
      expect(result.data![0].firstName).toBe('Bob');
    });

    it('falls back to workphone match', async () => {
      mockGet
        .mockResolvedValueOnce({ data: { items: [], total_count: '0', pagination: { next: '' } } })
        .mockResolvedValueOnce({
          data: {
            items: [
              { patient_id: 'pat-4', firstname: 'Carol', lastname: 'White', cell: '', homephone: '', workphone: '9876543210' },
            ],
            total_count: '1',
            pagination: { next: '' },
          },
        });

      const result = await service.searchPatients({ query: '9876543210' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('pat-4');
    });

    it('strips country code 1 when matching phones', async () => {
      mockGet
        .mockResolvedValueOnce({ data: { items: [], total_count: '0', pagination: { next: '' } } })
        .mockResolvedValueOnce({
          data: {
            items: [
              { patient_id: 'pat-5', firstname: 'Dave', lastname: 'Jones', cell: '', homephone: '15551234567', workphone: '' },
            ],
            total_count: '1',
            pagination: { next: '' },
          },
        });

      const result = await service.searchPatients({ query: '+15551234567' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('pat-5');
    });

    it('returns empty when no phone fields match', async () => {
      mockGet
        .mockResolvedValueOnce({ data: { items: [], total_count: '0', pagination: { next: '' } } })
        .mockResolvedValueOnce({
          data: {
            items: [
              { patient_id: 'pat-6', firstname: 'Eve', lastname: 'Gray', cell: '', homephone: '1111111111', workphone: '2222222222' },
            ],
            total_count: '1',
            pagination: { next: '' },
          },
        });

      const result = await service.searchPatients({ query: '9999999999' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('does not trigger fallback for non-phone queries', async () => {
      mockGet.mockResolvedValue({
        data: { items: [], total_count: '0', pagination: { next: '' } },
      });

      const result = await service.searchPatients({ query: 'Jane Doe' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('paginates through multiple batches in fallback', async () => {
      const batch1 = Array.from({ length: 100 }, (_, i) => ({
        patient_id: `pat-${i}`, firstname: 'P', lastname: `${i}`, cell: '', homephone: '', workphone: '',
      }));
      batch1[80].homephone = '5551112222';

      mockGet
        .mockResolvedValueOnce({ data: { items: [], total_count: '0', pagination: { next: '' } } })
        .mockResolvedValueOnce({ data: { items: batch1, total_count: '120', pagination: { next: 'page2' } } })
        .mockResolvedValueOnce({
          data: {
            items: [{ patient_id: 'pat-101', firstname: 'Match', lastname: 'Two', cell: '5551112222', homephone: '', workphone: '' }],
            total_count: '120',
            pagination: { next: '' },
          },
        });

      const result = await service.searchPatients({ query: '5551112222', limit: 5 });

      expect(result.success).toBe(true);
      expect(result.data!.length).toBeGreaterThanOrEqual(1);
      expect(result.data![0].id).toBe('pat-80');
    });
  });

  describe('checkAvailability — inferred slots fallback', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('infers slots from booked appointments when 204 returned', async () => {
      // 2025-03-17 is a Monday
      mockGet
        .mockResolvedValueOnce({ status: 204, data: '' })
        .mockResolvedValueOnce({
          data: {
            items: [{
              appointment_sr_no: 'apt-1',
              patient_id: 'pat-1',
              provider_id: 'DOC1',
              date: '2025-03-17',
              time: '10:00',
              length: '60',
              status: 'scheduled',
            }],
            total_count: '1',
            pagination: { next: '' },
          },
        })
        .mockResolvedValueOnce({
          data: {
            items: [{
              id: 'DOC1',
              first_name: 'Brian',
              last_name: 'Albert',
              status: 'active',
            }],
            total_count: '1',
          },
        });

      const result = await service.checkAvailability({ date: '2025-03-17' });

      expect(result.success).toBe(true);
      expect(result.data!.length).toBeGreaterThan(0);
      const slot = result.data![0];
      expect(slot.providerId).toBe('DOC1');
      expect(slot.available).toBe(true);
      expect(slot.reason).toBe('inferred');
      expect(slot.providerName).toBe('Brian Albert');
    });

    it('does not infer slots on weekends and returns closedDay instead of noContent', async () => {
      mockGet
        .mockResolvedValueOnce({ status: 204, data: '' })
        .mockResolvedValueOnce({ data: { items: [], total_count: '0', pagination: { next: '' } } })
        .mockResolvedValueOnce({
          data: {
            items: [{ id: 'DOC1', first_name: 'Dr', last_name: 'One', status: 'active' }],
            total_count: '1',
          },
        });

      // 2025-03-16 is a Sunday
      const result = await service.checkAvailability({ date: '2025-03-16' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(result.meta?.closedDay).toBe(true);
      expect(result.meta?.noContent).toBeUndefined();
    });

    it('excludes booked time blocks from inferred slots', async () => {
      mockGet
        .mockResolvedValueOnce({ status: 204, data: '' })
        .mockResolvedValueOnce({
          data: {
            items: [
              { appointment_sr_no: 'apt-1', patient_id: 'p1', provider_id: 'DOC1', date: '2025-03-17', time: '08:00', length: '30', status: 'scheduled' },
              { appointment_sr_no: 'apt-2', patient_id: 'p2', provider_id: 'DOC1', date: '2025-03-17', time: '08:30', length: '30', status: 'scheduled' },
            ],
            total_count: '2',
            pagination: { next: '' },
          },
        })
        .mockResolvedValueOnce({
          data: {
            items: [{ id: 'DOC1', first_name: 'Dr', last_name: 'One', status: 'active' }],
            total_count: '1',
          },
        });

      const result = await service.checkAvailability({ date: '2025-03-17', duration: 30 });

      expect(result.success).toBe(true);
      const slotHours = result.data!.map(s => s.startTime.getHours() * 100 + s.startTime.getMinutes());
      expect(slotHours).not.toContain(800);
      expect(slotHours).not.toContain(830);
      expect(slotHours).toContain(900);
      expect(result.data!.length).toBeGreaterThan(0);
      expect(result.data![0].startTime.getHours()).toBe(9);
      expect(result.data![0].startTime.getMinutes()).toBe(0);
    });

    it('returns 204 noContent when inference also finds no slots', async () => {
      mockGet
        .mockResolvedValueOnce({ status: 204, data: '' })
        .mockResolvedValueOnce({ data: { items: [], total_count: '0', pagination: { next: '' } } })
        .mockResolvedValueOnce({ data: { items: [], total_count: '0' } });

      const result = await service.checkAvailability({ date: '2025-03-15' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(result.meta?.noContent).toBe(true);
    });

    it('returns normal slots when available_slots API has data', async () => {
      mockGet.mockResolvedValue({
        data: {
          items: [{
            date: '2025-03-15',
            time: '14:00',
            length: '30',
            provider_id: 'DOC1',
          }],
        },
      });

      const result = await service.checkAvailability({ date: '2025-03-15' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta?.inferred).toBeUndefined();
      expect(result.meta?.noContent).toBeUndefined();
    });

    it('populates providerName from Sikka lowercase field names in inferred slots', async () => {
      mockGet
        .mockResolvedValueOnce({ status: 204, data: '' })
        .mockResolvedValueOnce({
          data: { items: [], total_count: '0', pagination: { next: '' } },
        })
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                provider_id: 'HYG2',
                firstname: 'Bruce',
                lastname: 'Bently',
                status: 'active',
                practice_id: '1',
              },
              {
                provider_id: 'DOC1',
                firstname: 'Albert',
                lastname: 'Jones',
                status: 'active',
                practice_id: '1',
              },
            ],
            total_count: '2',
          },
        });

      // 2025-03-17 is a Monday
      const result = await service.checkAvailability({ date: '2025-03-17' });

      expect(result.success).toBe(true);
      expect(result.data!.length).toBeGreaterThan(0);
      const providerNames = [...new Set(result.data!.map(s => s.providerName))];
      expect(providerNames).toContain('Bruce Bently');
      expect(providerNames).toContain('Albert Jones');
    });
  });

  describe('bookAppointment — provider_id always included', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('sends provider_id when providerId is given', async () => {
      mockPost.mockResolvedValue({
        data: { writeback_id: 'wb-1', status: 'completed' },
      });
      mockGet
        .mockResolvedValueOnce({
          data: { status: 'completed', result: 'completed' },
        });

      await service.bookAppointment({
        patientId: '12',
        providerId: 'DOC1',
        startTime: new Date('2026-03-13T15:00:00'),
        duration: 30,
        appointmentType: 'cleaning',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/appointment',
        expect.objectContaining({ provider_id: 'DOC1' }),
        expect.anything(),
      );
    });

    it('auto-resolves provider_id from providers API when not given', async () => {
      mockPost.mockResolvedValue({
        data: { writeback_id: 'wb-1', status: 'completed' },
      });
      mockGet
        .mockResolvedValueOnce({
          data: { items: [{ provider_id: 'HYG1', firstname: 'Tina', lastname: 'Jones', status: 'active' }] },
        })
        .mockResolvedValueOnce({
          data: { items: [] },
        })
        .mockResolvedValueOnce({
          data: { status: 'completed', result: 'completed' },
        });

      await service.bookAppointment({
        patientId: '12',
        startTime: new Date('2026-03-13T15:00:00'),
        duration: 30,
        appointmentType: 'cleaning',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/appointment',
        expect.objectContaining({ provider_id: 'HYG1' }),
        expect.anything(),
      );
    });
  });

  describe('bookAppointment — operatory auto-resolve', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('auto-resolves operatory using the operatory name from /operatories API', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({
          data: { items: [{ operatory_id: '5', operatory: 'Tina', abbreviation: 'Hyg1', is_hidden: 'F' }] },
        })
        .mockResolvedValueOnce({
          data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Booked' }] },
        });

      await service.bookAppointment({
        patientId: '12',
        providerId: 'DOC1',
        startTime: new Date('2026-03-13T15:00:00'),
        duration: 30,
        appointmentType: 'cleaning',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/appointment',
        expect.objectContaining({ operatory: 'Tina' }),
        expect.anything(),
      );
    });

    it('falls back to operatory_id when operatory name is missing', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({
          data: { items: [{ operatory_id: '5', abbreviation: 'Hyg1' }] },
        })
        .mockResolvedValueOnce({
          data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Booked' }] },
        });

      await service.bookAppointment({
        patientId: '12',
        providerId: 'DOC1',
        startTime: new Date('2026-03-13T15:00:00'),
        duration: 30,
        appointmentType: 'cleaning',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/appointment',
        expect.objectContaining({ operatory: '5' }),
        expect.anything(),
      );
    });

    it('uses metadata.operatory if provided', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({
          data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Booked' }] },
        });

      await service.bookAppointment({
        patientId: '12',
        providerId: 'DOC1',
        startTime: new Date('2026-03-13T15:00:00'),
        duration: 30,
        appointmentType: 'cleaning',
        metadata: { operatory: 'OP-CUSTOM' },
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/appointment',
        expect.objectContaining({ operatory: 'OP-CUSTOM' }),
        expect.anything(),
      );
    });
  });

  describe('pollWritebackStatus — 401 handling', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('treats writeback as accepted when writeback_status returns 401', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({
          data: { items: [{ operatory_id: '5', operatory: 'Tina', abbreviation: 'Hyg1' }] },
        })
        .mockRejectedValueOnce({
          response: { status: 401, data: { error_code: 'API2004', long_message: 'You are not authorized' } },
        });

      const result = await service.bookAppointment({
        patientId: '12',
        providerId: 'DOC1',
        startTime: new Date('2026-03-13T15:00:00'),
        duration: 30,
        appointmentType: 'cleaning',
      });

      expect(result.success).toBe(true);
    });

    it('treats writeback as accepted when writeback_status returns 403', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({
          data: { items: [{ operatory_id: '5', operatory: 'Tina' }] },
        })
        .mockRejectedValueOnce({
          response: { status: 403, data: {} },
        });

      const result = await service.bookAppointment({
        patientId: '12',
        providerId: 'DOC1',
        startTime: new Date('2026-03-13T15:00:00'),
        duration: 30,
        appointmentType: 'cleaning',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('createPatient — provider_id always included', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('auto-resolves provider_id from providers API', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({
          data: { items: [{ provider_id: 'DOC2', firstname: 'Sarah', lastname: 'Lex', status: 'active' }] },
        })
        .mockResolvedValueOnce({
          data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Created' }] },
        });

      await service.createPatient({
        firstName: 'New',
        lastName: 'Patient',
        phone: '5551234567',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/patient',
        expect.objectContaining({ provider_id: 'DOC2', practice_id: '1' }),
        expect.anything(),
      );
    });

    it('uses metadata.providerId when provided', async () => {
      mockPost.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({
          data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Created' }] },
        });

      await service.createPatient({
        firstName: 'New',
        lastName: 'Patient',
        metadata: { providerId: 'HYG1' },
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/patient',
        expect.objectContaining({ provider_id: 'HYG1' }),
        expect.anything(),
      );
    });
  });

  describe('rescheduleAppointment — provider_id always included', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('uses provided providerId', async () => {
      mockPut.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Updated' }] } })
        .mockResolvedValueOnce({
          data: { items: [{ appointment_sr_no: 'apt-1', patient_id: 'pat-1', provider_id: 'DOC1', date: '2025-03-16', time: '14:00', length: '45', status: 'scheduled' }] },
        });

      await service.rescheduleAppointment('apt-1', {
        startTime: new Date('2025-03-16T14:00:00Z'),
        duration: 45,
        providerId: 'DOC1',
      });

      expect(mockPut).toHaveBeenCalledWith(
        '/appointments/apt-1',
        expect.objectContaining({ provider_id: 'DOC1' }),
        expect.anything(),
      );
    });

    it('auto-resolves provider_id when not given', async () => {
      mockPut.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({
          data: { items: [{ provider_id: 'HYG2', firstname: 'Bruce', lastname: 'B', status: 'active' }] },
        })
        .mockResolvedValueOnce({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Updated' }] } })
        .mockResolvedValueOnce({
          data: { items: [{ appointment_sr_no: 'apt-1', patient_id: 'pat-1', provider_id: 'HYG2', date: '2025-03-16', time: '14:00', length: '45', status: 'scheduled' }] },
        });

      await service.rescheduleAppointment('apt-1', {
        startTime: new Date('2025-03-16T14:00:00Z'),
        duration: 45,
      });

      expect(mockPut).toHaveBeenCalledWith(
        '/appointments/apt-1',
        expect.objectContaining({ provider_id: 'HYG2' }),
        expect.anything(),
      );
    });
  });

  describe('updatePatient — field mapping and practice_id', () => {
    beforeEach(() => {
      service = new SikkaPmsService('acc-1', VALID_CREDENTIALS, {});
    });

    it('maps camelCase fields to Sikka lowercase format', async () => {
      mockPatch.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Updated' }] } })
        .mockResolvedValueOnce({
          data: { items: [{ patient_id: 'pat-1', firstname: 'Jane', lastname: 'Smith', email: 'jane@test.com' }] },
        });

      await service.updatePatient('pat-1', {
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '5551234567',
        email: 'jane@test.com',
      });

      expect(mockPatch).toHaveBeenCalledWith(
        '/patient/pat-1',
        expect.objectContaining({
          practice_id: '1',
          firstname: 'Jane',
          lastname: 'Smith',
          cell: '5551234567',
          email: 'jane@test.com',
        }),
        expect.anything(),
      );
    });

    it('always includes practice_id even with minimal updates', async () => {
      mockPatch.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Updated' }] } })
        .mockResolvedValueOnce({
          data: { items: [{ patient_id: 'pat-1', firstname: 'Jane', lastname: 'Doe', email: 'new@test.com' }] },
        });

      await service.updatePatient('pat-1', { email: 'new@test.com' });

      const payload = mockPatch.mock.calls[0][1];
      expect(payload.practice_id).toBe('1');
    });

    it('maps address fields to Sikka format', async () => {
      mockPatch.mockResolvedValue({ data: { long_message: 'Id:wb-1' } });
      mockGet
        .mockResolvedValueOnce({ data: { items: [{ is_completed: 'True', has_error: 'False', result: 'Updated' }] } })
        .mockResolvedValueOnce({
          data: { items: [{ patient_id: 'pat-1', firstname: 'Bob', lastname: 'Z' }] },
        });

      await service.updatePatient('pat-1', {
        address: { street: '123 Main St', city: 'Dallas', state: 'TX', zip: '75001' },
      });

      expect(mockPatch).toHaveBeenCalledWith(
        '/patient/pat-1',
        expect.objectContaining({
          address_line1: '123 Main St',
          city: 'Dallas',
          state: 'TX',
          zipcode: '75001',
        }),
        expect.anything(),
      );
    });
  });
});
