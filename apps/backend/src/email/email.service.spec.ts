import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

jest.mock('@aws-sdk/client-ses', () => {
  const mockSend = jest.fn().mockResolvedValue({ MessageId: 'test-msg-id' });
  return {
    SESClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
    SendEmailCommand: jest.fn().mockImplementation((input) => input),
    __mockSend: mockSend,
  };
});

describe('EmailService', () => {
  let service: EmailService;
  let mockSend: jest.Mock;

  const createService = async (configOverrides: Record<string, string> = {}) => {
    const defaults: Record<string, string> = {
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      EMAIL_FROM: 'test@parlae.ca',
      EMAIL_FROM_NAME: 'Parlae Test',
      ...configOverrides,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => defaults[key] || undefined),
          },
        },
      ],
    }).compile();

    return module.get<EmailService>(EmailService);
  };

  beforeEach(async () => {
    const ses = require('@aws-sdk/client-ses');
    mockSend = ses.__mockSend;
    mockSend.mockReset().mockResolvedValue({ MessageId: 'test-msg-id' });
    service = await createService();
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should not initialize SES when credentials are missing', async () => {
      const svc = await createService({
        AWS_REGION: '',
        AWS_ACCESS_KEY_ID: '',
        AWS_SECRET_ACCESS_KEY: '',
      });
      await expect(
        svc.sendEmail({ to: 'a@b.com', subject: 'Test', html: '<p>hi</p>' }),
      ).rejects.toThrow('AWS SES not configured');
    });
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      await service.sendEmail({
        to: 'patient@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should use custom from address when provided', async () => {
      await service.sendEmail({
        to: 'patient@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
        from: 'custom@parlae.ca',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw when SES send fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('SES error'));
      await expect(
        service.sendEmail({ to: 'a@b.com', subject: 'Fail', html: '<p>x</p>' }),
      ).rejects.toThrow('SES error');
    });
  });
});
