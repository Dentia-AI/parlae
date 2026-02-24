import { SecretsService } from './secrets.service';

// Mock the entire AWS SDK module
jest.mock('@aws-sdk/client-secrets-manager', () => {
  const mockSend = jest.fn();
  return {
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    GetSecretValueCommand: jest.fn().mockImplementation((input) => ({ input })),
    CreateSecretCommand: jest.fn().mockImplementation((input) => ({ input })),
    PutSecretValueCommand: jest.fn().mockImplementation((input) => ({ input })),
    __mockSend: mockSend,
  };
});

describe('SecretsService', () => {
  let service: SecretsService;
  let mockSend: jest.Mock;

  beforeEach(() => {
    const awsModule = require('@aws-sdk/client-secrets-manager');
    mockSend = awsModule.__mockSend;
    mockSend.mockReset();
    service = new SecretsService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPracticeCredentials', () => {
    it('should return credentials from AWS', async () => {
      const creds = { officeId: 'off-1', secretKey: 'sk-1' };
      mockSend.mockResolvedValueOnce({ SecretString: JSON.stringify(creds) });

      const result = await service.getPracticeCredentials('account-123');
      expect(result).toEqual(creds);
    });

    it('should return null for ResourceNotFoundException', async () => {
      const err = new Error('Not found');
      (err as any).name = 'ResourceNotFoundException';
      mockSend.mockRejectedValueOnce(err);

      const result = await service.getPracticeCredentials('account-123');
      expect(result).toBeNull();
    });

    it('should throw for other errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));
      await expect(service.getPracticeCredentials('account-123')).rejects.toThrow(
        'Network error',
      );
    });

    it('should cache results on subsequent calls', async () => {
      const creds = { officeId: 'off-1', secretKey: 'sk-1' };
      mockSend.mockResolvedValueOnce({ SecretString: JSON.stringify(creds) });

      await service.getPracticeCredentials('account-123');
      const result2 = await service.getPracticeCredentials('account-123');
      expect(result2).toEqual(creds);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return null when SecretString is empty', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: null });
      const result = await service.getPracticeCredentials('account-456');
      expect(result).toBeNull();
    });
  });

  describe('invalidateCache', () => {
    it('should clear cached credentials', async () => {
      const creds = { officeId: 'off-1', secretKey: 'sk-1' };
      mockSend.mockResolvedValue({ SecretString: JSON.stringify(creds) });

      await service.getPracticeCredentials('account-123');
      service.invalidateCache('account-123');
      await service.getPracticeCredentials('account-123');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('storePracticeCredentials', () => {
    it('should create a new secret', async () => {
      mockSend.mockResolvedValueOnce({ ARN: 'arn:aws:test' });
      const result = await service.storePracticeCredentials('account-123', {
        officeId: 'off-1',
        secretKey: 'sk-1',
      });
      expect(result).toBe('arn:aws:test');
    });

    it('should update if secret already exists', async () => {
      const existsError = new Error('exists');
      (existsError as any).name = 'ResourceExistsException';
      mockSend
        .mockRejectedValueOnce(existsError)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ ARN: 'arn:aws:updated' });

      const result = await service.storePracticeCredentials('account-123', {
        officeId: 'off-1',
        secretKey: 'sk-1',
      });
      expect(result).toBe('arn:aws:updated');
    });

    it('should throw for other errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Access denied'));
      await expect(
        service.storePracticeCredentials('acc-1', { officeId: '1', secretKey: 's' }),
      ).rejects.toThrow('Access denied');
    });
  });

  describe('updatePracticeTokens', () => {
    it('should update tokens for existing credentials', async () => {
      const existing = { officeId: 'off-1', secretKey: 'sk-1' };
      mockSend
        .mockResolvedValueOnce({ SecretString: JSON.stringify(existing) })
        .mockResolvedValueOnce({ ARN: 'arn:aws:test' });

      await service.updatePracticeTokens('account-123', {
        requestKey: 'rk-new',
        refreshKey: 'rfk-new',
        tokenExpiry: '2026-12-31',
      });
      expect(mockSend).toHaveBeenCalled();
    });

    it('should throw if no existing credentials found', async () => {
      const err = new Error('Not found');
      (err as any).name = 'ResourceNotFoundException';
      mockSend.mockRejectedValueOnce(err);

      await expect(
        service.updatePracticeTokens('missing-account', {
          requestKey: 'rk',
          refreshKey: 'rfk',
          tokenExpiry: '2026-12-31',
        }),
      ).rejects.toThrow('No practice credentials found');
    });
  });
});
