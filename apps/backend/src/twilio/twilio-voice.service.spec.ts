import { Test, TestingModule } from '@nestjs/testing';
import { TwilioVoiceService } from './twilio-voice.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../test/mocks/prisma.mock';

jest.mock('twilio', () => {
  const VoiceResponseMock = jest.fn().mockImplementation(() => ({
    say: jest.fn(),
    record: jest.fn(),
    dial: jest.fn().mockReturnValue({ sip: jest.fn() }),
    hangup: jest.fn(),
    toString: jest.fn().mockReturnValue('<Response>mock-twiml</Response>'),
  }));
  const mockDefault = Object.assign(jest.fn(), {
    twiml: { VoiceResponse: VoiceResponseMock },
  });
  return {
    __esModule: true,
    default: mockDefault,
  };
});

describe('TwilioVoiceService', () => {
  let service: TwilioVoiceService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioVoiceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TwilioVoiceService>(TwilioVoiceService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleInboundCall', () => {
    it('should return error response when clinic not found', async () => {
      prisma.vapiPhoneNumber.findFirst.mockResolvedValue(null);

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
    });

    it('should handle errors gracefully', async () => {
      prisma.vapiPhoneNumber.findFirst.mockRejectedValue(new Error('DB error'));

      const result = await service.handleInboundCall({
        From: '+14155551111',
        To: '+14155552222',
        CallSid: 'CA_test',
      });

      expect(result).toContain('</Response>');
    });
  });
});
